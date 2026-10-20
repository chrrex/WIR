import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { ContentService } from '../content/content.service';

/** Sprachen für Inhalte (ADR-054). Die Oberfläche bleibt vorerst deutsch. */
export const LANGUAGES: Record<string, string> = {
  de: 'Deutsch', en: 'English', pl: 'Polski', uk: 'Українська', ro: 'Română', bg: 'Български', hu: 'Magyar', tr: 'Türkçe', es: 'Español', id: 'Bahasa Indonesia',
};
export type Entity = 'CONTENT_ITEM' | 'COMMENT' | 'CHAT_MESSAGE' | 'AGENDA_ITEM' | 'MEETING_DECISION';
export interface Item { entity: Entity; id: string; field: 'title' | 'body' }

export const sourceHash = (text: string) => createHash('sha256').update(text).digest('hex');

/** Anbieter austauschbar (ADR-022): DeepL für Übersetzungen, ein KI-Modell (OpenAI-kompatible Schnittstelle) für Leichte Sprache. */
interface Provider { name: string; run(texts: string[], target: string, plain: boolean): Promise<string[]> }

const deepl = (key: string, url: string): Provider => ({
  name: 'deepl',
  async run(texts, target) {
    const body = new URLSearchParams({ target_lang: target === 'en' ? 'EN-GB' : target.toUpperCase(), preserve_formatting: '1' });
    texts.forEach((t) => body.append('text', t));
    const r = await fetch(url, { method: 'POST', headers: { Authorization: `DeepL-Auth-Key ${key}` }, body });
    if (!r.ok) throw new Error(`DeepL ${r.status}`);
    return ((await r.json()) as { translations: Array<{ text: string }> }).translations.map((t) => t.text);
  },
});

const llm = (base: string, key: string, model: string): Provider => ({
  name: `llm:${model}`,
  async run(texts, target, plain) {
    const lang = LANGUAGES[target] ?? target;
    const system = plain
      ? target === 'de'
        ? 'Schreibe den Text in Leichter Sprache nach den Regeln des Netzwerks Leichte Sprache: kurze Sätze, ein Gedanke pro Satz, bekannte Wörter, schwierige Wörter erklären, keine Fremdwörter. Inhalt nicht verändern, nichts erfinden. Gib nur den Text aus.'
        : `Translate the text into very simple, easy-to-read ${lang} (short sentences, common words). Keep the meaning, invent nothing. Output only the text.`
      : `Translate the text into ${lang}. Keep line breaks, names and @mentions. Output only the translation.`;
    return Promise.all(texts.map(async (t) => {
      const r = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: 'system', content: system }, { role: 'user', content: t }] }) });
      if (!r.ok) throw new Error(`KI ${r.status}`);
      return ((await r.json()) as { choices: Array<{ message: { content: string } }> }).choices[0].message.content.trim();
    }));
  },
});

@Injectable()
export class TranslateService {
  private readonly log = new Logger('Übersetzung');
  /** Testbar: Anbieter austauschen */
  provider: { translate: Provider | null; plain: Provider | null };

  constructor(private readonly prisma: PrismaService, private readonly content: ContentService) {
    const e = process.env;
    const ai = e.LLM_BASE_URL && e.LLM_API_KEY && e.LLM_MODEL ? llm(e.LLM_BASE_URL, e.LLM_API_KEY, e.LLM_MODEL) : null;
    this.provider = { translate: e.DEEPL_API_KEY ? deepl(e.DEEPL_API_KEY, e.DEEPL_API_URL ?? 'https://api.deepl.com/v2/translate') : ai, plain: ai };
  }

  /** Originaltext laden – nur, was die Person sehen darf. */
  private async source(userId: string, it: Item): Promise<{ text: string; locale: string; plainText?: string | null } | null> {
    const db = this.prisma.db;
    try {
      if (it.entity === 'CONTENT_ITEM') {
        const i = await this.content.getVisible(userId, it.id);
        const kv = i.knowledgeArticle ? await db.knowledgeVersion.findFirst({ where: { articleId: i.id, status: 'PUBLISHED' }, orderBy: { versionNumber: 'desc' } }) : null;
        const title = i.post?.title ?? i.handover?.subject ?? kv?.title ?? this.content.titleOf(i);
        const body = i.post?.bodyText ?? i.handover?.bodyText ?? kv?.bodyText ?? null;
        const text = it.field === 'title' ? title : body;
        return text ? { text, locale: i.sourceLocale, plainText: it.field === 'body' ? kv?.plainLanguageText : null } : null;
      }
      if (it.entity === 'AGENDA_ITEM' || it.entity === 'MEETING_DECISION') {
        // Meeting-Protokoll: Punkt (Titel, Notizen) oder Entscheidung – vertrauliche Punkte nur für Berechtigte
        const d = it.entity === 'MEETING_DECISION' ? await db.meetingDecision.findUnique({ where: { id: it.id } }) : null;
        const a = await db.agendaItem.findUnique({ where: { id: d?.itemId ?? it.id }, include: { meeting: { include: { attendees: { where: { userId } } } } } });
        if (!a) return null;
        const i = await this.content.getVisible(userId, a.meetingId);
        const role = a.meeting.attendees[0]?.role;
        if (a.confidential && ![a.authorId, a.ownerId, i.authorId, ...a.viewerIds].includes(userId) && role !== 'LEAD' && role !== 'MINUTES') return null;
        const text = d ? d.text : it.field === 'title' ? a.title : a.notes ?? a.description;
        return text ? { text, locale: i.sourceLocale } : null;
      }
      if (it.entity === 'COMMENT') {
        const c = await db.comment.findFirst({ where: { id: it.id, deletedAt: null } });
        if (!c) return null;
        await this.content.getVisible(userId, c.contentItemId);
        return { text: c.bodyText, locale: c.sourceLocale };
      }
      const m = await db.chatMessage.findFirst({ where: { id: it.id, deletedAt: null, conversation: { participants: { some: { userId, leftAt: null } } } } });
      return m?.body ? { text: m.body, locale: m.sourceLocale } : null;
    } catch { return null; }
  }

  /** Übersetzen bzw. in Leichte Sprache bringen – erst aus dem Zwischenspeicher, sonst beim Anbieter. */
  async run(userId: string, items: Item[], target: string, plain: boolean) {
    const db = this.prisma.db;
    const out: Array<Item & { text: string | null; from: string | null }> = [];
    const missing: Array<{ i: number; src: string; hash: string; locale: string }> = [];
    for (const it of items) {
      const s = await this.source(userId, it);
      if (!s) { out.push({ ...it, text: null, from: null }); continue; }
      if (s.locale === target && !plain) { out.push({ ...it, text: s.text, from: null }); continue; }
      if (plain && target === 'de' && s.plainText) { out.push({ ...it, text: s.plainText, from: s.locale }); continue; }
      const hash = sourceHash(s.text);
      const hit = await db.contentTranslation.findFirst({ where: { entityType: it.entity, entityId: it.id, field: it.field, targetLocale: target, isPlainLanguage: plain, sourceHash: hash } });
      out.push({ ...it, text: hit?.text ?? null, from: s.locale });
      if (!hit) missing.push({ i: out.length - 1, src: s.text, hash, locale: s.locale });
    }
    const p = plain ? this.provider.plain : this.provider.translate;
    if (missing.length && p) {
      try {
        const res = await p.run(missing.map((m) => m.src), target, plain);
        for (const [k, m] of missing.entries()) {
          const it = out[m.i];
          it.text = res[k];
          await db.contentTranslation.upsert({
            where: { entityType_entityId_field_targetLocale_isPlainLanguage_sourceHash: { entityType: it.entity, entityId: it.id, field: it.field, targetLocale: target, isPlainLanguage: plain, sourceHash: m.hash } },
            create: { entityType: it.entity, entityId: it.id, field: it.field, sourceLocale: m.locale, targetLocale: target, sourceHash: m.hash, text: res[k], isPlainLanguage: plain, provider: p.name },
            update: {},
          });
        }
      } catch (e) { this.log.warn(`Anbieter nicht erreichbar: ${(e as Error).message}`); }
    }
    return { available: !!p, items: out };
  }
}

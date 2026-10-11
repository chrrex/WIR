import { Body, Controller, Get, HttpCode, Post, Query, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, RequirePermission, SessionUser } from '../auth/decorators';
import { PolicyService } from '../policy/policy.service';
import { can } from '../policy/engine';
import { linkFor } from '../content/content.controller';
import { absencesToday } from '../people/people.controller';

interface Hit { id: string; type: string; kind: string | null; title: string; snippet: string; text: string; rank: number }
const LABEL: Record<string, string> = { KNOWLEDGE_ARTICLE: 'Wissen', DOCUMENT: 'Dokument', POST: 'News' };
const Ask = z.object({ question: z.string().trim().min(3).max(500) });

/**
 * Suche und KI-Assistent – beide nur über diesen Retrieval-Weg:
 * Treffer kommen ausschließlich aus Inhalten, bei denen die Person in content_recipients steht.
 * Sensible Dokumente werden gar nicht erst indexiert. Fragen werden nicht gespeichert.
 */
@Controller()
export class SearchController {
  constructor(private readonly prisma: PrismaService, private readonly policy: PolicyService) {}

  private async retrieve(userId: string, q: string, any: boolean, limit: number): Promise<Hit[]> {
    const words = (q.match(/[\p{L}\p{N}]{2,}/gu) ?? []).slice(0, 8).map((w) => `${w.toLowerCase()}:*`);
    if (!words.length) return [];
    const rows = await this.prisma.db.$queryRawUnsafe<Hit[]>(`
      SELECT DISTINCT ON (ci.id) ci.id::text, ci.type::text, p.kind::text AS kind, c.title, c.text,
        ts_headline('german', c.text, q, 'MaxWords=28,MinWords=10,StartSel=«,StopSel=»') AS snippet, ts_rank(c.tsv, q) AS rank
      FROM search_chunks c JOIN content_items ci ON ci.id = c.content_item_id LEFT JOIN posts p ON p.id = ci.id,
        to_tsquery('german', $1) q
      WHERE c.tsv @@ q AND ci.deleted_at IS NULL AND ci.status = 'PUBLISHED'
        AND EXISTS (SELECT 1 FROM content_recipients r WHERE r.content_item_id = ci.id AND r.user_id = $2::uuid AND r.removed_at IS NULL)
      ORDER BY ci.id, rank DESC`, words.join(any ? ' | ' : ' & '), userId);
    return rows.sort((a, b) => b.rank - a.rank).slice(0, limit);
  }

  @RequirePermission('search.use')
  @Get('search')
  async search(@CurrentUser() me: SessionUser, @Query('q') q = '') {
    const hits = await this.retrieve(me.id, q, false, 25);
    const ctx = await this.policy.loadContext(me.id);
    const term = q.trim().slice(0, 60);
    const contacts = can(ctx, 'contacts.read') && term.length >= 2
      ? await this.prisma.db.contact.findMany({ where: { isActive: true, OR: [{ companyId: null }, { companyId: { in: ctx.companyIds } }], AND: [{ OR: [{ organizationName: { contains: term, mode: 'insensitive' } }, { contactPerson: { contains: term, mode: 'insensitive' } }] }] }, take: 5 })
      : [];
    // Kolleg:innen (Name, Tätigkeit, Bereich) – nur mit Verzeichnisrecht und aus den eigenen Gesellschaften
    const people = can(ctx, 'employees.directory') && term.length >= 2
      ? await this.prisma.db.user.findMany({ where: { status: 'ACTIVE', userType: 'EMPLOYEE', employeeProfile: { companyAssignments: { some: { companyId: { in: ctx.companyIds } } } },
          OR: [{ displayName: { contains: term, mode: 'insensitive' } }, { employeeProfile: { OR: [{ firstName: { contains: term, mode: 'insensitive' } }, { lastName: { contains: term, mode: 'insensitive' } }, { jobTitle: { contains: term, mode: 'insensitive' } }] } },
            { groupMemberships: { some: { group: { name: { contains: term, mode: 'insensitive' } } } } }] },
        include: { employeeProfile: { select: { jobTitle: true } } }, orderBy: { displayName: 'asc' }, take: 8 })
      : [];
    const away = await absencesToday(this.prisma.db, people.map((p) => p.id));
    return {
      people: people.map((p) => ({ id: p.id, name: p.displayName, job: p.employeeProfile?.jobTitle ?? null, absent: away.get(p.id) ?? null })),
      results: hits.map((h) => ({ id: h.id, label: LABEL[h.type] ?? h.type, title: h.title, snippet: h.snippet, href: linkFor({ id: h.id, type: h.type, post: h.kind ? { kind: h.kind } : null }) })),
      contacts: contacts.map((c) => ({ id: c.id, name: c.organizationName, person: c.contactPerson, phone: c.phone })),
    };
  }

  @RequirePermission('ai.use')
  @Post('ai/ask')
  @HttpCode(200)
  async ask(@CurrentUser() me: SessionUser, @Body(new ZodPipe(Ask)) b: z.infer<typeof Ask>) {
    const hits = await this.retrieve(me.id, b.question, true, 5);
    const sources = hits.map((h, i) => ({ n: i + 1, id: h.id, label: LABEL[h.type] ?? h.type, title: h.title, snippet: h.snippet, href: linkFor({ id: h.id, type: h.type, post: h.kind ? { kind: h.kind } : null }) }));
    const { AI_BASE_URL, AI_API_KEY, AI_MODEL } = process.env;
    if (!AI_BASE_URL || !AI_MODEL || !hits.length) return { mode: 'sources' as const, answer: null, sources };
    const context = hits.map((h, i) => `[${i + 1}] ${h.title}\n${h.text}`).join('\n\n');
    // OpenAI-kompatible Schnittstelle (z. B. STACKIT AI Model Serving); Anbieterwahl ist noch offen (ARCHITECTURE_DECISIONS, KI)
    const res = await fetch(`${AI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', signal: AbortSignal.timeout(30_000),
      headers: { 'content-type': 'application/json', ...(AI_API_KEY ? { authorization: `Bearer ${AI_API_KEY}` } : {}) },
      body: JSON.stringify({
        model: AI_MODEL, temperature: 0.1, max_tokens: 600,
        messages: [
          { role: 'system', content: 'Du bist der Wissensassistent im Mitarbeiterportal WIR. Antworte auf Deutsch, in Du-Form, kurz und konkret. Nutze ausschließlich die Quellen. Belege jede Aussage mit [Nummer]. Steht die Antwort nicht in den Quellen, sag das ehrlich und nenne, wen man fragen kann.' },
          { role: 'user', content: `Quellen:\n${context}\n\nFrage: ${b.question}` },
        ],
      }),
    }).catch(() => null);
    if (!res?.ok) throw new ServiceUnavailableException('Der KI-Assistent ist gerade nicht erreichbar. Die Fundstellen findest du über die Suche.');
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return { mode: 'llm' as const, answer: data.choices?.[0]?.message?.content?.trim() ?? '', sources };
  }
}

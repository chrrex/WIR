'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { RichText } from '@/components/content/MentionText';
import { api } from './api';
import { useMe } from './me';

/** Automatische Übersetzung bzw. Leichte Sprache (ADR-054): gebündelte Anfragen, Ergebnis je Sitzung zwischengespeichert. */
type Entity = 'CONTENT_ITEM' | 'COMMENT' | 'CHAT_MESSAGE';
type Field = 'title' | 'body';
interface Res { text: string | null; from: string | null }

const cache = new Map<string, Promise<Res>>();
let queue: Array<{ key: string; item: { entity: Entity; id: string; field: Field }; plain: boolean; done: (r: Res) => void }> = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  const all = queue; queue = [];
  for (const plain of [false, true]) {
    const part = all.filter((q) => q.plain === plain);
    for (let i = 0; i < part.length; i += 50) {
      const chunk = part.slice(i, i + 50);
      api<{ items: Res[] }>('/translations', { method: 'POST', json: { items: chunk.map((c) => c.item), plain } })
        .then((r) => chunk.forEach((c, k) => c.done(r.items[k] ?? { text: null, from: null })))
        .catch(() => chunk.forEach((c) => { cache.delete(c.key); c.done({ text: null, from: null }); }));
    }
  }
}

function request(entity: Entity, id: string, field: Field, plain: boolean, target: string) {
  const key = [target, plain, entity, id, field].join('|');
  if (!cache.has(key)) {
    cache.set(key, new Promise<Res>((done) => { queue.push({ key, item: { entity, id, field }, plain, done }); timer ??= setTimeout(flush, 30); }));
  }
  return cache.get(key)!;
}

// „Original anzeigen“ gilt für die ganze Sitzung
let showOriginal = false;
const subs = new Set<() => void>();
export function useShowOriginal(): [boolean, (v: boolean) => void] {
  const v = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => showOriginal, () => false);
  return [v, (n) => { showOriginal = n; subs.forEach((f) => f()); }];
}

/** Ist für mich Übersetzung oder Leichte Sprache an? */
export function useTranslation() {
  const { me } = useMe();
  const s = me?.settings;
  return { on: !!s && (s.plainLanguage || (s.autoTranslate && !!s.locale)), plain: !!s?.plainLanguage, target: s?.locale ?? 'de' };
}

/** Text in meiner Sprache – oder das Original, solange (noch) keine Übersetzung da ist. */
export function useTx(entity: Entity, id: string | undefined, field: Field, original: string) {
  const { on, plain, target } = useTranslation();
  const [orig] = useShowOriginal();
  const [res, setRes] = useState<Res | null>(null);
  useEffect(() => {
    if (!on || !id || !original) { setRes(null); return; }
    let live = true;
    void request(entity, id, field, plain, target).then((r) => { if (live) setRes(r); });
    return () => { live = false; };
  }, [on, id, entity, field, plain, target, original]);
  const translated = !orig && !!res?.text && res.text !== original;
  return { text: translated ? res!.text! : original, translated, lang: translated ? target : undefined };
}

/** Kurzer Text (Titel) – mit lang-Attribut, wenn übersetzt. */
export function Tx({ e, id, f = 'title', text }: { e: Entity; id: string; f?: Field; text: string }) {
  const t = useTx(e, id, f, text);
  return t.translated ? <span lang={t.lang}>{t.text}</span> : <>{text}</>;
}

/** Auszug aus dem (übersetzten) Text für Listen. */
export function TxExcerpt({ id, text, max = 180 }: { id: string; text: string; max?: number }) {
  const t = useTx('CONTENT_ITEM', id, 'body', text);
  return t.translated ? <span lang={t.lang}>{t.text.length > max ? `${t.text.slice(0, max)} …` : t.text}</span> : <>{text}</>;
}

/** Fließtext eines Inhalts (Absätze, Erwähnungen) – übersetzt, wenn eingeschaltet. */
export function Body({ id, text, mentions }: { id: string; text: string; mentions?: Array<{ name: string }> }) {
  const t = useTx('CONTENT_ITEM', id, 'body', text);
  const { plain } = useTranslation();
  return <div className="prose" lang={t.lang} data-plain={t.translated && plain ? '' : undefined}><RichText text={t.text} mentions={mentions} /></div>;
}

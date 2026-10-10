import type { PrismaClient } from './generated/client';

type Db = Pick<PrismaClient, 'searchChunk'>;

/** Text in Abschnitte von ca. 900 Zeichen schneiden (an Absatz- bzw. Satzgrenzen). */
export function chunkText(text: string, size = 900): string[] {
  const parts = text.split(/\n{2,}|(?<=[.!?])\s+/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = '';
  for (const p of parts) {
    if (cur && cur.length + p.length > size) { out.push(cur); cur = ''; }
    cur = cur ? `${cur} ${p}` : p;
  }
  if (cur) out.push(cur);
  return out.length ? out : [''];
}

/**
 * Suchindex eines Inhalts ersetzen (nur aktuelle Version). Die Rechte prüft
 * ausschließlich die Abfrage über content_recipients – nie der Index selbst.
 */
export async function indexContent(db: Db, contentItemId: string, version: number, title: string, text: string) {
  await db.searchChunk.deleteMany({ where: { contentItemId } });
  await db.searchChunk.createMany({
    data: chunkText(text).map((t, chunkIndex) => ({ contentItemId, versionNumber: version, chunkIndex, locale: 'de', title, text: t })),
  });
}

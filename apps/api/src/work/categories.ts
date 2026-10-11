/** Gemeinsamer Kategorienbaum für Wissen und Dokumente (ADR-044/045). */
export interface CategoryRow { id: string; name: string; parentId: string | null; sortOrder: number; isSensitive?: boolean }
export interface CategoryNode { id: string; name: string; parentId: string | null; path: string; sensitive: boolean }

/** Aktive Kategorien → Liste mit Pfad „Küche › Reinigung“; „vertraulich“ vererbt sich nach unten. */
export function categoryTree(all: CategoryRow[]): CategoryNode[] {
  const byId = new Map(all.map((c) => [c.id, c]));
  const chain = (c: CategoryRow) => {
    const out = [c];
    for (let p = c.parentId ? byId.get(c.parentId) : undefined; p && out.length < 10; p = p.parentId ? byId.get(p.parentId) : undefined) out.unshift(p);
    return out;
  };
  return all
    .map((c) => { const ch = chain(c); return { id: c.id, name: c.name, parentId: c.parentId && byId.has(c.parentId) ? c.parentId : null, path: ch.map((x) => x.name).join(' › '), sensitive: ch.some((x) => !!x.isSensitive), order: ch.map((x) => String(x.sortOrder).padStart(4, '0') + x.name).join('/') }; })
    .sort((a, b) => a.order.localeCompare(b.order, 'de'))
    .map(({ order, ...c }) => c);
}

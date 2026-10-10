/**
 * Policy-Engine – reine Funktionen ohne Datenbank (docs/RBAC.md §6).
 * Default Deny: Ohne ausdrückliche Berechtigung im passenden Scope kein Zugriff.
 */

export type Scope =
  | { type: 'global' }
  | { type: 'company'; id: string }
  | { type: 'group'; id: string };

export interface PolicyContext {
  userId: string;
  active: boolean;
  /** alle aktiven Gesellschaftszuordnungen der Person */
  companyIds: string[];
  /** Gruppen der Person inkl. Elterngruppen */
  groupIds: string[];
  grants: Map<string, Scope[]>;
  /** Eltern-Beziehungen für die Vererbung (Stiftung → Wirkungsort → Gesellschaft) */
  companyParent: Map<string, string | null>;
  groupParent: Map<string, string | null>;
}

export interface Target {
  companyId?: string | null;
  groupId?: string | null;
}

/** true, wenn `node` gleich `ancestor` ist oder darunter im Baum liegt. */
export function isWithin(node: string | null | undefined, ancestor: string, parent: Map<string, string | null>): boolean {
  let cur: string | null | undefined = node;
  const seen = new Set<string>();
  while (cur) {
    if (cur === ancestor) return true;
    if (seen.has(cur)) return false; // Schutz vor Zyklen
    seen.add(cur);
    cur = parent.get(cur) ?? null;
  }
  return false;
}

export function scopeCovers(scope: Scope, target: Target, ctx: Pick<PolicyContext, 'companyParent' | 'groupParent'>): boolean {
  switch (scope.type) {
    case 'global':
      return true;
    case 'company':
      return !!target.companyId && isWithin(target.companyId, scope.id, ctx.companyParent);
    case 'group':
      return !!target.groupId && isWithin(target.groupId, scope.id, ctx.groupParent);
  }
}

/**
 * Darf die Person `permission` ausführen – optional bezogen auf ein Ziel
 * (Gesellschaft und/oder Gruppe des Objekts)?
 */
export function can(ctx: PolicyContext, permission: string, target?: Target): boolean {
  if (!ctx.active) return false;
  const scopes = ctx.grants.get(permission);
  if (!scopes || scopes.length === 0) return false;
  if (!target) return true;
  return scopes.some((s) => scopeCovers(s, target, ctx));
}

/** Alle Gesellschaften, für die die Person `permission` hat (für Listenfilter). */
export function companiesWith(ctx: PolicyContext, permission: string, allCompanyIds: string[]): string[] | 'all' {
  if (!ctx.active) return [];
  const scopes = ctx.grants.get(permission) ?? [];
  if (scopes.some((s) => s.type === 'global')) return 'all';
  return allCompanyIds.filter((id) => scopes.some((s) => s.type === 'company' && isWithin(id, s.id, ctx.companyParent)));
}

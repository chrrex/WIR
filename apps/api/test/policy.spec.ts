import { can, companiesWith, isWithin, PolicyContext, Scope } from '../src/policy/engine';

// Baum: Stiftung → SGL → SGL-Hotel ; Stiftung → B
const companyParent = new Map<string, string | null>([
  ['stiftung', null], ['sgl', 'stiftung'], ['sgl-hotel', 'sgl'], ['b', 'stiftung'],
]);
const groupParent = new Map<string, string | null>([['service', null], ['service-bar', 'service'], ['kueche', null]]);

function ctx(grants: Record<string, Scope[]>, active = true): PolicyContext {
  return { userId: 'u', active, companyIds: ['sgl'], groupIds: [], grants: new Map(Object.entries(grants)), companyParent, groupParent };
}

describe('Policy-Engine (RBAC §6)', () => {
  test('Baumvererbung', () => {
    expect(isWithin('sgl-hotel', 'stiftung', companyParent)).toBe(true);
    expect(isWithin('b', 'sgl', companyParent)).toBe(false);
    expect(isWithin('sgl', 'sgl', companyParent)).toBe(true);
  });

  const cases: Array<[string, Record<string, Scope[]>, string, { companyId?: string; groupId?: string } | undefined, boolean]> = [
    ['ohne Recht → nein', {}, 'users.manage', undefined, false],
    ['globales Recht, ohne Ziel → ja', { 'news.read': [{ type: 'global' }] }, 'news.read', undefined, true],
    ['globales Recht, beliebiges Ziel → ja', { 'users.manage': [{ type: 'global' }] }, 'users.manage', { companyId: 'b' }, true],
    ['Gesellschaft SGL deckt Untergesellschaft', { 'users.manage': [{ type: 'company', id: 'sgl' }] }, 'users.manage', { companyId: 'sgl-hotel' }, true],
    ['Gesellschaft SGL deckt NICHT Gesellschaft B', { 'users.manage': [{ type: 'company', id: 'sgl' }] }, 'users.manage', { companyId: 'b' }, false],
    ['Stiftung deckt alle Häuser', { 'news.publish': [{ type: 'company', id: 'stiftung' }] }, 'news.publish', { companyId: 'b' }, true],
    ['Gesellschafts-Scope ohne Ziel-Gesellschaft → nein', { 'users.manage': [{ type: 'company', id: 'sgl' }] }, 'users.manage', { groupId: 'service' }, false],
    ['Gruppe Service deckt Untergruppe Bar', { 'tasks.assign': [{ type: 'group', id: 'service' }] }, 'tasks.assign', { groupId: 'service-bar' }, true],
    ['Gruppe Service deckt NICHT Küche', { 'tasks.assign': [{ type: 'group', id: 'service' }] }, 'tasks.assign', { groupId: 'kueche' }, false],
    ['anderes Recht hilft nicht', { 'news.read': [{ type: 'global' }] }, 'news.publish', undefined, false],
  ];

  test.each(cases)('%s', (_name, grants, perm, target, expected) => {
    expect(can(ctx(grants), perm, target)).toBe(expected);
  });

  test('inaktive Person darf nichts – auch mit globalem Recht', () => {
    expect(can(ctx({ 'news.read': [{ type: 'global' }] }, false), 'news.read')).toBe(false);
  });

  test('companiesWith liefert nur Gesellschaften im Scope', () => {
    const c = ctx({ 'users.read': [{ type: 'company', id: 'sgl' }] });
    expect(companiesWith(c, 'users.read', ['stiftung', 'sgl', 'sgl-hotel', 'b'])).toEqual(['sgl', 'sgl-hotel']);
    expect(companiesWith(ctx({ 'users.read': [{ type: 'global' }] }), 'users.read', ['x'])).toBe('all');
    expect(companiesWith(ctx({}), 'users.read', ['x'])).toEqual([]);
  });
});

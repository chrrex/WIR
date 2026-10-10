/**
 * Seed für Entwicklung, Codespaces und Demo.
 * ALLE Personen, Namen und Zahlen sind erfunden – keine echten Mitarbeiterdaten.
 *
 * Testzugänge (nur Entwicklung!):
 *   jana.m, maren.h, lena.k, nora.s, tom.b.extern  →  Passwort: Wir-Demo-2026
 *   paula.s  →  Erstzugang mit Einmal-Code 482 913 (Pflicht-Passwortwechsel)
 */
import 'dotenv/config';
import { hash } from '@node-rs/argon2';
import { createPrismaClient, PERMISSIONS, ROLES, SENSITIVE_PERMISSIONS, hashOneTimeCode } from '../src';

const prisma = createPrismaClient();
const DEMO_PASSWORD = 'Wir-Demo-2026';
const DEMO_CODE = '482913';
const SECRET = process.env.APP_SECRET ?? 'nur-fuer-entwicklung-bitte-aendern';

async function main() {
  console.log('Seed: lösche vorhandene Daten …');
  await prisma.$executeRawUnsafe(`
    TRUNCATE audit_logs, sessions, credential_resets, user_roles, user_groups, employee_company_assignments,
      employee_profiles, user_settings, dashboard_preferences, users, role_permissions, permissions, roles,
      groups, company_brandings, companies, system_settings CASCADE`);

  // ---- Rechte & Rollen ------------------------------------------------------
  for (const [module, keys] of Object.entries(PERMISSIONS)) {
    for (const key of keys) {
      await prisma.permission.create({
        data: { key, module, isSensitive: (SENSITIVE_PERMISSIONS as readonly string[]).includes(key) },
      });
    }
  }
  const perms = new Map((await prisma.permission.findMany()).map((p) => [p.key, p.id]));
  const roles = new Map<string, string>();
  for (const r of ROLES) {
    const role = await prisma.role.create({
      data: {
        key: r.key, name: r.name, description: r.description, isSystem: true,
        permissions: { create: [...new Set(r.permissions)].map((k) => ({ permissionId: perms.get(k)! })) },
      },
    });
    roles.set(r.key, role.id);
  }

  // ---- Gesellschaften & Auftritt (ADR-034, ADR-039) -------------------------
  const stiftung = await prisma.company.create({
    data: {
      name: 'DKB STIFTUNG', shortName: 'DKB-STIFTUNG', kind: 'FOUNDATION',
      disabledModules: ['HANDOVERS', 'CHECKLISTS', 'SHIFTS', 'OCCUPANCY'],
      branding: {
        create: {
          displayName: 'DKB STIFTUNG', primaryColor: '#0066CC', surfaceColor: '#1A8FE3',
          logoRequiresWhite: true, footerText: 'DKB STIFTUNG · für alle Gesellschaften der Gruppe',
        },
      },
    },
  });
  const sgl = await prisma.company.create({
    data: {
      name: 'Schloss & Gut Liebenberg', shortName: 'SGL', kind: 'LOCATION', parentId: stiftung.id,
      branding: {
        create: {
          displayName: 'Schloss & Gut Liebenberg', primaryColor: '#6B7A3E', surfaceColor: '#6B7A3E',
          footerText: 'Ein Wirkungsort der DKB STIFTUNG',
        },
      },
    },
  });
  await prisma.company.create({
    data: {
      name: '[Gesellschaft B]', shortName: 'BEISPIEL-B', kind: 'LOCATION', parentId: stiftung.id, isActive: false,
      branding: { create: { displayName: '[Gesellschaft B]', primaryColor: '#00706E', footerText: 'Beispiel für Ausbaustufe 2' } },
    },
  });

  // ---- Gruppen (SGL) --------------------------------------------------------
  const groupNames = ['Rezeption', 'Service', 'Küche', 'Housekeeping', 'Verkauf & Veranstaltungen', 'Personal & Verwaltung', 'Haustechnik'];
  const groups = new Map<string, string>();
  for (const name of groupNames) {
    const g = await prisma.group.create({ data: { name, companyId: sgl.id, type: 'DEPARTMENT' } });
    groups.set(name, g.id);
  }
  const kommunikation = await prisma.group.create({ data: { name: 'Kommunikation', companyId: stiftung.id, type: 'DEPARTMENT' } });

  // ---- Personen -------------------------------------------------------------
  const passwordHash = await hash(DEMO_PASSWORD);
  const today = new Date('2026-01-01');

  async function person(o: {
    username: string; first: string; last: string; job: string; company: string; group?: string; lead?: boolean;
    roles: Array<{ key: string; company?: string; group?: string }>; status?: 'ACTIVE' | 'INVITED' | 'PROVISIONED';
    external?: boolean; validUntil?: Date; source?: 'LOCAL' | 'GASTROMATIC'; personnel?: string;
  }) {
    const status = o.status ?? 'ACTIVE';
    const user = await prisma.user.create({
      data: {
        username: o.username,
        displayName: `${o.first} ${o.last.charAt(0)}.`,
        userType: o.external ? 'EXTERNAL' : 'EMPLOYEE',
        status,
        passwordHash: status === 'ACTIVE' ? passwordHash : null,
        passwordChangedAt: status === 'ACTIVE' ? new Date() : null,
        mustChangePassword: status !== 'ACTIVE',
        activatedAt: status === 'PROVISIONED' ? null : new Date(),
        validUntil: o.validUntil,
        settings: { create: {} },
      },
    });
    if (!o.external) {
      await prisma.employeeProfile.create({
        data: {
          userId: user.id, companyId: o.company, firstName: o.first, lastName: o.last, jobTitle: o.job,
          personnelNumber: o.personnel, source: o.source ?? 'LOCAL',
          companyAssignments: { create: { companyId: o.company, isPrimary: true, jobTitle: o.job, validFrom: today, source: o.source ?? 'LOCAL' } },
        },
      });
    }
    if (o.group) {
      await prisma.groupMembership.create({ data: { userId: user.id, groupId: groups.get(o.group) ?? o.group, isLead: !!o.lead } });
    }
    for (const r of o.roles) {
      await prisma.userRole.create({
        data: { userId: user.id, roleId: roles.get(r.key)!, companyId: r.company, groupId: r.group ? groups.get(r.group) ?? r.group : undefined },
      });
    }
    return user;
  }

  await person({ username: 'jana.m', first: 'Jana', last: 'Muster', job: 'Rezeption', company: sgl.id, group: 'Rezeption',
    roles: [{ key: 'employee' }] });
  await person({ username: 'maren.h', first: 'Maren', last: 'Hofmann', job: 'Abteilungsleitung Service', company: sgl.id, group: 'Service', lead: true,
    roles: [{ key: 'employee' }, { key: 'team_lead', group: 'Service' }] });
  await person({ username: 'lena.k', first: 'Lena', last: 'Kranz', job: 'Personal & Verwaltung', company: sgl.id, group: 'Personal & Verwaltung',
    roles: [{ key: 'employee' }, { key: 'hr', company: sgl.id }, { key: 'it_admin', company: sgl.id }] });
  await person({ username: 'nora.s', first: 'Nora', last: 'Sommer', job: 'Kommunikation · DKB STIFTUNG', company: stiftung.id, group: kommunikation.id,
    roles: [{ key: 'employee' }, { key: 'foundation_editor', company: stiftung.id }] });
  await person({ username: 'tom.b.extern', first: 'Tom', last: 'Becker', job: 'Haustechnik (extern)', company: sgl.id, group: 'Haustechnik',
    external: true, validUntil: new Date('2027-03-31T23:59:59Z'), roles: [{ key: 'external', company: sgl.id }] });

  // Erstzugang mit Einmal-Code (Pflicht-Passwortwechsel)
  const paula = await person({ username: 'paula.s', first: 'Paula', last: 'Seidel', job: 'Veranstaltungsbetreuung', company: sgl.id,
    group: 'Verkauf & Veranstaltungen', status: 'INVITED', roles: [{ key: 'employee' }] });
  await prisma.credentialReset.create({
    data: { userId: paula.id, tokenHash: hashOneTimeCode(paula.id, DEMO_CODE, SECRET), channel: 'IN_PERSON',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365) },
  });

  // Aus Gastromatic angelegt, warten auf Freischaltung (ADR-021)
  const provisioned: Array<[string, string, string, string, string]> = [
    ['lara.w', 'Lara', 'Winter', 'Service', 'Service · Aushilfe'],
    ['dewi.p', 'Dewi', 'Putri', 'Küche', 'Auszubildende Köchin'],
    ['kemal.a', 'Kemal', 'Arslan', 'Housekeeping', 'Housekeeping'],
    ['nina.b', 'Nina', 'Brandt', 'Rezeption', 'Rezeption'],
  ];
  let nr = 4711;
  for (const [username, first, last, group, job] of provisioned) {
    await person({ username, first, last, job, company: sgl.id, group, status: 'PROVISIONED', source: 'GASTROMATIC',
      personnel: String(nr++), roles: [] });
  }

  // ---- Systemeinstellungen --------------------------------------------------
  await prisma.systemSetting.createMany({
    data: [
      { key: 'feature.read_tracking', value: false }, // erst nach Betriebsvereinbarung (ADR-012)
      { key: 'auth.one_time_code_hours', value: 24 },
      { key: 'auth.max_failed_logins', value: 5 },
    ],
  });

  await prisma.auditLog.create({ data: { actorType: 'SYSTEM', action: 'system.seeded', entityType: 'system', metadata: { note: 'Demo-Daten angelegt' } } });
  console.log('Seed fertig. Test-Passwort: %s · Erstzugang paula.s mit Code 482 913', DEMO_PASSWORD);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

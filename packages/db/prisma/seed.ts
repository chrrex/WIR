import { createHash } from 'node:crypto';
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
import { seedWork } from './seed-work';
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
      groups, company_brandings, companies, system_settings, knowledge_categories, document_categories,
      contact_categories, idea_categories, file_objects, lifecycle_templates, content_translations CASCADE`);

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

  const jana = await person({ username: 'jana.m', first: 'Jana', last: 'Muster', job: 'Rezeption', company: sgl.id, group: 'Rezeption',
    roles: [{ key: 'employee' }] });
  const maren = await person({ username: 'maren.h', first: 'Maren', last: 'Hofmann', job: 'Abteilungsleitung Service', company: sgl.id, group: 'Service', lead: true,
    roles: [{ key: 'employee' }, { key: 'team_lead', group: 'Service' }] });
  const lena = await person({ username: 'lena.k', first: 'Lena', last: 'Kranz', job: 'Personal & Verwaltung', company: sgl.id, group: 'Personal & Verwaltung',
    roles: [{ key: 'employee' }, { key: 'hr', company: sgl.id }, { key: 'it_admin', company: sgl.id }, { key: 'moderator', company: sgl.id }, { key: 'role_admin', company: sgl.id }] });
  const nora = await person({ username: 'nora.s', first: 'Nora', last: 'Sommer', job: 'Kommunikation · DKB STIFTUNG', company: stiftung.id, group: kommunikation.id,
    roles: [{ key: 'employee' }, { key: 'foundation_editor', company: stiftung.id }] });
  const tom = await person({ username: 'tom.b.extern', first: 'Tom', last: 'Becker', job: 'Haustechnik (extern)', company: sgl.id, group: 'Haustechnik',
    external: true, validUntil: new Date('2027-03-31T23:59:59Z'), roles: [{ key: 'external', company: sgl.id }] });

  // Weitere Kolleg:innen (aktiv), damit Team, Chat und Lesestatus lebendig wirken
  const extra: Array<[string, string, string, string, string, string[]]> = [
    ['selin.a', 'Selin', 'Aydin', 'Rezeption', 'Rezeption · Nachtdienst', ['employee']],
    ['jonas.w', 'Jonas', 'Weber', 'Rezeption', 'Teamleitung Rezeption', ['employee']],
    ['piotr.n', 'Piotr', 'Nowak', 'Rezeption', 'Rezeption', ['employee']],
    ['tobias.k', 'Tobias', 'Krüger', 'Service', 'Service', ['employee']],
    ['ana.f', 'Ana', 'Ferreira', 'Service', 'Service', ['employee']],
    ['marta.w', 'Marta', 'Wójcik', 'Housekeeping', 'Housekeeping', ['employee']],
    ['sven.r', 'Sven', 'Richter', 'Küche', 'Küchenleitung', ['employee', 'department_head']],
  ];
  const team = new Map<string, string>();
  for (const [username, first, last, group, job, rs] of extra) {
    const u = await person({ username, first, last, job, company: sgl.id, group, lead: rs.includes('department_head'),
      roles: rs.map((key) => (key === 'department_head' ? { key, company: sgl.id } : { key })) });
    team.set(username, u.id);
  }
  // Teamleitung Rezeption (prüft u. a. Wissenseinträge des Teams)
  await prisma.userRole.create({ data: { userId: team.get('jonas.w')!, roleId: roles.get('team_lead')!, groupId: groups.get('Rezeption') } });
  await prisma.groupMembership.updateMany({ where: { userId: team.get('jonas.w')!, groupId: groups.get('Rezeption') }, data: { isLead: true } });

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

  // ---- Inhalte für Phase 2 (alles erfunden) ---------------------------------
  const live = await prisma.user.findMany({ where: { status: { in: ['ACTIVE', 'INVITED'] } }, include: { employeeProfile: true, groupMemberships: true } });
  const employees = live.filter((u) => u.userType === 'EMPLOYEE').map((u) => u.id);
  const sglPeople = live.filter((u) => u.userType === 'EMPLOYEE' && u.employeeProfile?.companyId === sgl.id).map((u) => u.id);
  const membersOf = (...names: string[]) => live.filter((u) => u.groupMemberships.some((m) => names.map((n) => groups.get(n)).includes(m.groupId))).map((u) => u.id);
  const ago = (h: number) => new Date(Date.now() - h * 3600_000);
  const body = (t: string) => ({ type: 'text', paragraphs: t.split(/\n{2,}/) });

  async function post(o: { author: string; kind: 'NEWS' | 'SOCIAL'; title: string; text: string; hoursAgo: number; recipients: string[];
    audience: { targetType: 'ALL_USERS' | 'COMPANY' | 'GROUP'; companyId?: string; groupId?: string }[]; important?: boolean; company?: string;
    category?: 'GREETINGS' | 'MARKETPLACE' | 'CONGRATULATIONS' | 'LEISURE' | 'OTHER' | 'THANKS'; intent?: 'OFFER' | 'SEARCH'; price?: string; readBy?: string[]; likes?: string[] }) {
    const ci = await prisma.contentItem.create({ data: {
      type: 'POST', companyId: o.company ?? sgl.id, authorId: o.author, status: 'PUBLISHED', publishedAt: ago(o.hoursAgo), createdAt: ago(o.hoursAgo),
      importance: o.important ? 'IMPORTANT' : 'NORMAL', expiresAt: o.category === 'MARKETPLACE' ? new Date(Date.now() + 25 * 864e5) : null,
      post: { create: { title: o.title, body: body(o.text), bodyText: o.text, kind: o.kind, socialCategory: o.category ?? null,
        marketplaceIntent: o.category === 'MARKETPLACE' ? o.intent ?? 'OFFER' : null, priceLabel: o.category === 'MARKETPLACE' ? o.price ?? null : null } },
      audiences: { create: o.audience },
    } });
    await prisma.contentRecipient.createMany({ data: [...new Set([...o.recipients, o.author])].map((userId) => ({ contentItemId: ci.id, userId })), skipDuplicates: true });
    const day = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    if (o.readBy?.length) await prisma.readReceipt.createMany({ data: o.readBy.map((userId) => ({ contentItemId: ci.id, userId, firstSeenAt: day, openedAt: day })) });
    if (o.likes?.length) await prisma.reaction.createMany({ data: o.likes.map((userId, i) => ({ contentItemId: ci.id, userId, type: (['THUMBS_UP', 'HEART', 'CELEBRATE'] as const)[i % 3] })) });
    return ci;
  }
  const T = (u: string) => team.get(u)!;

  await post({ author: T('sven.r'), kind: 'NEWS', important: true, hoursAgo: 3, title: 'HACCP: Neue Regel zur Kühlkette bei Anlieferungen',
    text: 'Ab sofort messen wir bei jeder Tiefkühl-Lieferung die Kerntemperatur – nicht mehr nur stichprobenartig.\n\nDie Arbeitsanweisung „Kühlkette bei der Warenannahme“ wird gerade überarbeitet. Bitte sprecht mich bei Fragen direkt an.',
    recipients: sglPeople, audience: [{ targetType: 'COMPANY', companyId: sgl.id }], readBy: [T('tobias.k'), T('ana.f')], likes: [T('tobias.k')] });
  const dienst = await post({ author: maren.id, kind: 'NEWS', hoursAgo: 5, title: 'Neue Dienstkleidung für Service und Rezeption ab November',
    text: 'Ab dem 2. November tragen Service und Rezeption die neue Dienstkleidung. Die Anprobe findet am 14. und 15. Oktober jeweils von 14 bis 16 Uhr im Personalraum statt.\n\nBitte trag dich bis Freitag in die Größentabelle ein. Fragen gern an mich oder @Tobias K.',
    recipients: membersOf('Service', 'Rezeption'), audience: [{ targetType: 'GROUP', groupId: groups.get('Service') }, { targetType: 'GROUP', groupId: groups.get('Rezeption') }],
    readBy: [T('selin.a'), T('jonas.w'), T('tobias.k')], likes: [T('selin.a'), T('ana.f'), T('jonas.w')] });
  await prisma.comment.create({ data: { contentItemId: dienst.id, authorId: T('piotr.n'), body: body('Gibt es die Hose auch in kurzer Länge?'), bodyText: 'Gibt es die Hose auch in kurzer Länge?', createdAt: ago(4.5) } });
  await prisma.comment.create({ data: { contentItemId: dienst.id, authorId: maren.id, body: body('Ja, in drei Längen – steht in der Tabelle.'), bodyText: 'Ja, in drei Längen – steht in der Tabelle.', createdAt: ago(4.2) } });
  await post({ author: nora.id, kind: 'NEWS', hoursAgo: 8, company: stiftung.id, title: 'Gruppenweit: Das WIR kommt Schritt für Schritt in alle Gesellschaften',
    text: 'Liebenberg macht den Anfang. Danach folgen nach und nach die weiteren Gesellschaften der Stiftungsgruppe – jede in ihren eigenen Farben und mit eigenem Logo, auf einer gemeinsamen Basis.\n\nGruppenweite Mitteilungen wie diese erreichen alle Kolleg:innen der Gruppe. Was nur ein Haus betrifft, bleibt in diesem Haus.',
    recipients: employees, audience: [{ targetType: 'ALL_USERS' }], likes: [jana.id, maren.id] });
  await post({ author: lena.id, kind: 'NEWS', hoursAgo: 50, title: 'Willkommen im Team: drei neue Azubis in Küche und Service',
    text: 'Wir freuen uns über drei neue Auszubildende: zwei in der Küche, eine im Service. Sie haben in dieser Woche ihre erste Station begonnen.\n\nSprecht sie gern an und zeigt ihnen, wo es den besten Kaffee gibt.',
    recipients: sglPeople, audience: [{ targetType: 'COMPANY', companyId: sgl.id }], readBy: sglPeople.filter((u) => u !== jana.id), likes: [maren.id, T('selin.a'), T('sven.r')] });

  await post({ author: T('marta.w'), kind: 'SOCIAL', category: 'GREETINGS', hoursAgo: 20, title: 'Grüße von der Ostsee', text: 'Sonne, Wind und Fischbrötchen – ich denk an euch! Bis nächste Woche.',
    recipients: employees, audience: [{ targetType: 'ALL_USERS' }], likes: [jana.id, maren.id, T('ana.f')] });
  await post({ author: T('tobias.k'), kind: 'SOCIAL', category: 'MARKETPLACE', intent: 'OFFER', price: '80 €', hoursAgo: 30, title: 'Trekkingrad abzugeben',
    text: '28 Zoll, 21 Gänge, frisch gewartet. Ideal für den Weg zum Bahnhof. Bei Interesse einfach im Chat melden.',
    recipients: employees, audience: [{ targetType: 'ALL_USERS' }] });
  await post({ author: T('piotr.n'), kind: 'SOCIAL', category: 'LEISURE', hoursAgo: 70, title: 'Laufgruppe am Donnerstag?', text: 'Wer hat Lust, nach der Frühschicht eine Runde um den See zu laufen? Ganz entspannt, 5–7 km.',
    recipients: employees, audience: [{ targetType: 'ALL_USERS' }], likes: [jana.id] });

  // Abstimmung in einer News (ADR-050)
  const xmas = await post({ author: maren.id, kind: 'NEWS', hoursAgo: 6, title: 'Weihnachtsfeier: Welcher Termin passt euch?',
    text: 'Wir feiern dieses Jahr in der Orangerie. Stimmt bitte bis Freitag ab, welcher Abend euch besser passt.', recipients: sglPeople, audience: [{ targetType: 'COMPANY', companyId: sgl.id }] });
  const poll = await prisma.poll.create({ data: { id: xmas.id, question: 'Welcher Abend passt dir?', options: { create: [{ label: 'Freitag, 15. Januar', sortOrder: 0 }, { label: 'Samstag, 16. Januar', sortOrder: 1 }] } }, include: { options: true } });
  await prisma.pollVote.createMany({ data: [[T('sven.r'), 0], [T('ana.f'), 0], [T('selin.a'), 1]].map(([userId, i]) => ({ userId: userId as string, optionId: poll.options[i as number].id })) });

  // Danke-Karten (ADR-051)
  async function thanks(author: string, motif: string, to: string[], group: string | null, text: string, hoursAgo: number, signers: string[] = [], source: string | null = null) {
    const names = [...live.filter((u) => to.includes(u.id)).map((u) => u.displayName), ...(group ? [`Team ${group}`] : [])];
    const ci = await post({ author, kind: 'SOCIAL', category: 'THANKS', hoursAgo, title: `Danke, ${names.join(' und ')}!`, text, recipients: employees, audience: [{ targetType: 'ALL_USERS' }], likes: [maren.id] });
    await prisma.post.update({ where: { id: ci.id }, data: { kudosMotif: motif, kudosGroupId: group ? groups.get(group) : null, kudosSource: source } });
    await prisma.reaction.createMany({ data: signers.map((userId) => ({ contentItemId: ci.id, userId, type: 'SIGN' as const })) });
    await prisma.mention.createMany({ data: to.map((mentionedUserId) => ({ mentionedUserId, contentItemId: ci.id })) });
  }
  await thanks(jana.id, 'HELP', [], 'Housekeeping', 'Danke für die superschnelle Zimmerfreigabe am Samstag – 14 Anreisen vor 13 Uhr, und alle Gäste waren happy!', 26, [T('selin.a'), T('jonas.w'), maren.id]);
  await thanks(T('sven.r'), 'TEAM', [T('ana.f')], null, 'Ana, du bist gestern beim Bankett spontan eingesprungen und hast den Abend gerettet. Danke!', 40, [T('tobias.k')]);
  await thanks(maren.id, 'GUEST', [], 'Service', 'Wir haben uns vom ersten Moment an willkommen gefühlt. Das Frühstücksteam war herzlich wie nie – danke für dieses wunderbare Wochenende!', 52, [], 'Gästebuch');

  // Übersetzungen für den Demo-Modus (ADR-054): Marta liest auf Polnisch; Leichte Sprache für die HACCP-News
  const TX: Array<[string, string, string]> = [
    ['HACCP: Neue Regel zur Kühlkette bei Anlieferungen', 'HACCP: Nowa zasada dotycząca łańcucha chłodniczego przy dostawach',
      'Od teraz przy każdej dostawie mrożonek mierzymy temperaturę wewnątrz produktu – już nie tylko wyrywkowo.\n\nInstrukcja pracy „Łańcuch chłodniczy przy przyjęciu towaru“ jest właśnie aktualizowana. W razie pytań proszę zwracać się bezpośrednio do mnie.'],
    ['Gruppenweit: Das WIR kommt Schritt für Schritt in alle Gesellschaften', 'Cała grupa: WIR krok po kroku we wszystkich spółkach',
      'Liebenberg jest pierwszy. Potem stopniowo dołączą kolejne spółki grupy fundacji – każda we własnych kolorach i z własnym logo, na wspólnej podstawie.\n\nKomunikaty dla całej grupy, takie jak ten, docierają do wszystkich koleżanek i kolegów w grupie. To, co dotyczy tylko jednego obiektu, zostaje w tym obiekcie.'],
    ['Willkommen im Team: drei neue Azubis in Küche und Service', 'Witamy w zespole: troje nowych uczniów w kuchni i obsłudze',
      'Cieszymy się z trojga nowych uczniów: dwoje w kuchni, jedna osoba w obsłudze. W tym tygodniu zaczęli swój pierwszy etap.\n\nZagadajcie do nich i pokażcie im, gdzie jest najlepsza kawa.'],
    ['Weihnachtsfeier: Welcher Termin passt euch?', 'Wigilia firmowa: Który termin wam pasuje?', 'W tym roku świętujemy w Oranżerii. Zagłosujcie do piątku, który wieczór bardziej wam pasuje.'],
    ['Laufgruppe am Donnerstag?', 'Grupa biegowa w czwartek?', 'Kto ma ochotę po porannej zmianie przebiec się dookoła jeziora? Na luzie, 5–7 km.'],
  ];
  const sha = (t: string) => createHash('sha256').update(t).digest('hex');
  const tx = (id: string, field: string, src: string, targetLocale: string, text: string, isPlainLanguage = false) =>
    ({ entityType: 'CONTENT_ITEM' as const, entityId: id, field, sourceLocale: 'de', targetLocale, sourceHash: sha(src), text, isPlainLanguage, provider: 'demo' });
  for (const [title, t, b] of TX) {
    const p = await prisma.post.findFirst({ where: { title } });
    if (p) await prisma.contentTranslation.createMany({ data: [tx(p.id, 'title', p.title, 'pl', t), tx(p.id, 'body', p.bodyText, 'pl', b)] });
  }
  const haccp = await prisma.post.findFirstOrThrow({ where: { title: TX[0][0] } });
  await prisma.contentTranslation.createMany({ data: [
    tx(haccp.id, 'title', haccp.title, 'de', 'HACCP: Neue Regel für gefrorene Lieferungen', true),
    tx(haccp.id, 'body', haccp.bodyText, 'de', 'Es gibt eine neue Regel.\nSie gilt ab heute.\n\nWir bekommen gefrorene Ware.\nDann messen wir jedes Mal die Temperatur.\nWir messen innen in der Ware.\nDas heißt: Kern-Temperatur.\n\nHast du Fragen?\nDann frag Sven.', true),
  ] });
  await prisma.userSettings.updateMany({ where: { user: { username: 'marta.w' } }, data: { locale: 'pl', autoTranslate: true } });
  // Heute im Haus (ADR-057): erfundene Geburtstage (freiwillig, ohne Jahr), Neue und ein Dienstjubiläum – relativ zum Seed-Tag
  const md = (days: number) => new Intl.DateTimeFormat('en-CA', { month: '2-digit', day: '2-digit', timeZone: 'Europe/Berlin' }).format(new Date(Date.now() + days * 864e5)).replace('/', '-');
  await prisma.userSettings.updateMany({ where: { user: { username: 'ana.f' } }, data: { showBirthday: true, birthdayMonthDay: md(0) } });
  await prisma.userSettings.updateMany({ where: { user: { username: 'piotr.n' } }, data: { showBirthday: true, birthdayMonthDay: md(3) } });
  await prisma.userSettings.updateMany({ where: { user: { username: 'jonas.w' } }, data: { showWorkAnniversary: true } });
  const yearsAgo = (y: number) => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - y); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); };
  await prisma.employeeProfile.updateMany({ where: { user: { username: 'jonas.w' } }, data: { entryDate: yearsAgo(5) } });
  await prisma.employeeProfile.updateMany({ where: { user: { username: 'selin.a' } }, data: { entryDate: new Date(Date.now() - 6 * 864e5) } });

  async function handover(o: { author: string; group: string; shift: string; hoursAgo: number; subject: string; text: string; readBy?: string[] }) {
    const ci = await prisma.contentItem.create({ data: {
      type: 'HANDOVER', companyId: sgl.id, authorId: o.author, status: 'PUBLISHED', publishedAt: ago(o.hoursAgo), createdAt: ago(o.hoursAgo),
      handover: { create: { groupId: groups.get(o.group), subject: o.subject, body: body(o.text), bodyText: o.text, shiftLabel: o.shift, shiftDate: ago(o.hoursAgo) } },
      audiences: { create: [{ targetType: 'GROUP', groupId: groups.get(o.group) }] },
    } });
    await prisma.contentRecipient.createMany({ data: [...new Set([...membersOf(o.group), o.author])].map((userId) => ({ contentItemId: ci.id, userId })), skipDuplicates: true });
    if (o.readBy?.length) { const d = new Date(); d.setUTCHours(0, 0, 0, 0); await prisma.readReceipt.createMany({ data: o.readBy.map((userId) => ({ contentItemId: ci.id, userId, firstSeenAt: d, openedAt: d })) }); }
  }
  await handover({ author: T('selin.a'), group: 'Rezeption', shift: 'Nacht', hoursAgo: 2, subject: 'Zwei offene Punkte für die Frühschicht',
    text: 'Zimmer 214: Gast hat um Weckruf 6:30 gebeten – erledigt, bitte um 7 Uhr kurz nachfragen, ob Taxi gebraucht wird.\n\nFundsache: schwarzer Schal aus dem Kaminzimmer liegt im Fundbuch, Nr. 31.\n\nKasse ist abgerechnet, Differenz 0,00 €.' });
  await handover({ author: jana.id, group: 'Rezeption', shift: 'Früh', hoursAgo: 22, subject: 'Tagungsgruppe Strategieworkshop', text: 'Die Gruppe im Schlosssaal hat die Kaffeepause auf 10:30 verschoben. Technik ist informiert.', readBy: [T('selin.a'), T('jonas.w')] });
  await handover({ author: T('tobias.k'), group: 'Service', shift: 'Spät', hoursAgo: 14, subject: 'Hochzeit Samstag: Allergien notiert', text: 'Drei vegane Gäste und eine Nussallergie – Küche weiß Bescheid, Tischkarten sind markiert.' });

  // Chats (nur Beispiele; Inhalte sieht niemand außer den Beteiligten)
  async function chat(type: 'DIRECT' | 'GROUP', members: string[], msgs: Array<[string, string, number]>, title?: string) {
    const c = await prisma.chatConversation.create({ data: {
      type, title, directKey: type === 'DIRECT' ? [...members].sort().join(':') : null, createdById: members[0], createdAt: ago(100),
      participants: { create: members.map((userId, i) => ({ userId, role: type === 'GROUP' && i === 0 ? 'ADMIN' : 'MEMBER', joinedAt: ago(100) })) },
    } });
    let last: { id: string; createdAt: Date } | null = null;
    for (const [sender, text, h] of msgs) last = await prisma.chatMessage.create({ data: { conversationId: c.id, senderId: sender, body: text, createdAt: ago(h) } });
    if (last) await prisma.chatConversation.update({ where: { id: c.id }, data: { lastMessageAt: last.createdAt } });
    return c;
  }
  await chat('GROUP', [jana.id, T('selin.a'), T('jonas.w'), T('piotr.n')], [
    [T('jonas.w'), 'Neuer Sitzplan für den Schlosssaal liegt im Backoffice.', 6],
    [T('selin.a'), 'Danke! Ich drucke ihn für die Nacht aus.', 5.5],
  ], 'Team Rezeption');
  await chat('DIRECT', [jana.id, T('piotr.n')], [[T('piotr.n'), 'Hast du die Namensschilder für die Tagung gesehen?', 3]]);
  await chat('DIRECT', [jana.id, maren.id], [[maren.id, 'Kannst du mir bis morgen die Größen der Rezeption schicken?', 26], [jana.id, 'Mache ich, sammle gerade noch.', 25]]);
  void tom;

  // ---- Inhalte für Phase 3+4 -------------------------------------------------
  await seedWork(prisma, { sgl: sgl.id, stiftung: stiftung.id, groups, T, jana: jana.id, maren: maren.id, lena: lena.id, nora: nora.id, sglPeople, employees, membersOf });

  // ---- Systemeinstellungen --------------------------------------------------
  await prisma.systemSetting.createMany({
    data: [
      { key: 'feature.read_tracking', value: true }, // Demo: an. Produktiv erst nach Betriebsvereinbarung (ADR-012)
      { key: 'auth.one_time_code_hours', value: 24 },
      { key: 'auth.max_failed_logins', value: 5 },
      { key: 'demo.seeded', value: true }, // Marker: nur Testdaten → Demo-Modus erlaubt (ADR-047)
    ],
  });

  await prisma.auditLog.create({ data: { actorType: 'SYSTEM', action: 'system.seeded', entityType: 'system', metadata: { note: 'Demo-Daten angelegt' } } });
  console.log('Seed fertig. Test-Passwort: %s · Erstzugang paula.s mit Code 482 913', DEMO_PASSWORD);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

/**
 * Phase 3+4 gegen echte Datenbank: Wissen (Versionen, Kenntnisnahme), Dokumente, Suche/KI
 * (nur berechtigte Treffer), Aufgaben, Checklisten (Grenzwerte), Umfragen (Anonymität), Ideen, Kontakte, Module.
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { PrismaService } from '../src/common/prisma.service';

jest.setTimeout(90_000);
const PW = 'Wir-Demo-2026';

describe('Phase 3+4 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sessions = new Map<string, ReturnType<typeof request.agent>>();
  async function as(username: string) {
    if (!sessions.has(username)) {
      const a = request.agent(app.getHttpServer());
      await a.post('/api/v1/auth/login').send({ username, password: PW }).expect(200);
      sessions.set(username, a);
    }
    return sessions.get(username)!;
  }
  const groupId = async (name: string) => (await prisma.db.group.findFirstOrThrow({ where: { name } })).id;
  const article = async (title: string) => (await prisma.db.knowledgeVersion.findFirstOrThrow({ where: { title: { startsWith: title }, status: 'PUBLISHED' } })).articleId;

  beforeAll(async () => {
    execSync('npx tsx prisma/seed.ts', { cwd: path.resolve(__dirname, '../../../packages/db'), stdio: 'ignore', env: process.env });
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => app?.close());

  test('Wissen: neue Version setzt Kenntnisnahme zurück, alte Versionen bleiben lesbar', async () => {
    const id = await article('Kühlkette');
    const tobias = await as('tobias.k');
    expect((await tobias.get(`/api/v1/knowledge/${id}`).expect(200)).body.acknowledged).toBe(true);
    const sven = await as('sven.r');
    const r = await sven.put(`/api/v1/knowledge/${id}`).send({ title: 'Kühlkette bei der Warenannahme', text: 'Neu: Grenzwert Kühlware +4 °C, TK -18 °C. Thermometer desinfizieren.', changeSummary: 'Test' }).expect(200);
    expect(r.body.version).toBe(3);
    const after = (await tobias.get(`/api/v1/knowledge/${id}`).expect(200)).body;
    expect(after.acknowledged).toBe(false);
    expect(after.history.map((h: { n: number }) => h.n)).toEqual([3, 2, 1]);
    await tobias.post(`/api/v1/knowledge/${id}/ack`).expect(200);
    expect((await tobias.get(`/api/v1/knowledge/${id}/versions/1`).expect(200)).body.text).toMatch(/stichprobenartig/i);
    await (await as('jana.m')).get(`/api/v1/knowledge/${id}`).expect(404); // Rezeption ist nicht Zielgruppe
  });

  test('Wissen: alle schreiben, Teamleitung prüft, korrigiert, gibt frei oder lehnt ab (ADR-045)', async () => {
    const cat = (await prisma.db.knowledgeCategory.findFirstOrThrow({ where: { name: 'Rezeption & Gäste' } })).id;
    const jana = await as('jana.m');
    const jonas = await as('jonas.w');
    const maren = await as('maren.h');
    // stiftungsgruppenweit einreichen → Entwurf
    const r = (await jana.post('/api/v1/knowledge').send({ categoryId: cat, articleType: 'WIKI', title: 'Taxi-Nummern für Gäste', text: 'Taxi Muster: 03300 000 999.', audience: ['ALL'] }).expect(201)).body;
    expect(r.status).toBe('DRAFT');
    await (await as('nora.s')).get(`/api/v1/knowledge/${r.id}`).expect(404); // noch nicht sichtbar
    expect((await jana.get('/api/v1/search?q=Taxi').expect(200)).body.results).toHaveLength(0);
    expect((await jonas.get('/api/v1/knowledge').expect(200)).body.review.map((a: { id: string }) => a.id)).toContain(r.id);
    await maren.post(`/api/v1/knowledge/${r.id}/review`).send({ approve: true }).expect(404); // fremde Teamleitung sieht ihn nicht
    await jana.post(`/api/v1/knowledge/${r.id}/review`).send({ approve: true }).expect(403);
    // korrigieren und freigeben
    await jonas.post(`/api/v1/knowledge/${r.id}/review`).send({ approve: true, correction: { title: 'Taxi für Gäste bestellen' } }).expect(200);
    const pub = (await (await as('nora.s')).get(`/api/v1/knowledge/${r.id}`).expect(200)).body; // Stiftung sieht ihn
    expect(pub).toMatchObject({ status: 'PUBLISHED', title: 'Taxi für Gäste bestellen' });
    expect((await jana.get('/api/v1/search?q=Taxi').expect(200)).body.results).toHaveLength(1);
    // ablehnen mit Begründung, überarbeiten, erneut einreichen
    const s2 = (await jana.post('/api/v1/knowledge').send({ categoryId: cat, articleType: 'WIKI', title: 'Pausenregel', text: 'Pause wann man will.', audience: [`G:${await groupId('Rezeption')}`] }).expect(201)).body.id;
    await jonas.post(`/api/v1/knowledge/${s2}/review`).send({ approve: false }).expect(400);
    await jonas.post(`/api/v1/knowledge/${s2}/review`).send({ approve: false, reason: 'Bitte mit dem Dienstplan abstimmen.' }).expect(200);
    expect((await jana.get(`/api/v1/knowledge/${s2}`).expect(200)).body).toMatchObject({ status: 'ARCHIVED', rejectedReason: 'Bitte mit dem Dienstplan abstimmen.' });
    await jana.post(`/api/v1/knowledge/${s2}/resubmit`).send({ title: 'Pausenregel Rezeption', text: 'Pausen nach Absprache im Dienstplan.' }).expect(200);
    expect((await jonas.get('/api/v1/knowledge').expect(200)).body.review.some((a: { id: string }) => a.id === s2)).toBe(true);
    // Teamleitung veröffentlicht eigene Einträge direkt; Kategorien pflegt die Abteilungsleitung
    expect((await jonas.post('/api/v1/knowledge').send({ categoryId: cat, articleType: 'SOP', title: 'Kassenabschluss', text: 'Täglich 22 Uhr.', audience: [`G:${await groupId('Rezeption')}`] }).expect(201)).body.status).toBe('PUBLISHED');
    await jana.post('/api/v1/knowledge/categories').send({ name: 'Test' }).expect(403);
    await (await as('sven.r')).post('/api/v1/knowledge/categories').send({ name: 'Weinwissen', parentId: cat }).expect(201);
  });

  test('Suche und KI finden nur berechtigte Inhalte; sensible Dokumente nie', async () => {
    const jana = await as('jana.m');
    const rez = (await jana.get('/api/v1/search?q=Check-in').expect(200)).body.results;
    expect(rez.some((r: { title: string }) => r.title.startsWith('Check-in'))).toBe(true);
    const kitchen = (await jana.get('/api/v1/search?q=Tiefkühl').expect(200)).body.results;
    expect(kitchen.some((r: { title: string }) => r.title.startsWith('Kühlkette'))).toBe(false); // nur Küche/Service
    expect(kitchen.some((r: { title: string }) => r.title.startsWith('Neue Regel zur Kühlkette'))).toBe(true); // News an die ganze Gesellschaft
    const lena = await as('lena.k');
    expect((await lena.get('/api/v1/search?q=Personalakte').expect(200)).body.results).toHaveLength(0);
    const ai = (await jana.post('/api/v1/ai/ask').send({ question: 'Wo hängt der Defibrillator?' }).expect(200)).body;
    expect(ai.mode).toBe('sources');
    expect(ai.sources[0].title).toMatch(/Erste Hilfe/);
    await (await as('tom.b.extern')).post('/api/v1/ai/ask').send({ question: 'Defibrillator' }).expect(403);
  });

  test('Dokumente: Upload prüft den Dateityp, Download nur für Berechtigte', async () => {
    const sven = await as('sven.r');
    await sven.post('/api/v1/files/document').attach('file', Buffer.from('MZ fake exe'), 'virus.pdf').expect(400);
    const up = await sven.post('/api/v1/files/document').attach('file', Buffer.from('%PDF-1.4\n%%EOF'), 'Plan.pdf').expect(201);
    const cat = (await prisma.db.documentCategory.findFirstOrThrow({ where: { isSensitive: false } })).id;
    const doc = await sven.post('/api/v1/documents').send({ categoryId: cat, title: 'Reinigungsplan Küche', fileId: up.body.id, audience: [`G:${await groupId('Küche')}`] }).expect(201);
    await sven.post('/api/v1/documents').send({ categoryId: cat, title: 'Doppelt', fileId: up.body.id, audience: [`G:${await groupId('Küche')}`] }).expect(400);
    await (await as('jana.m')).get(`/api/v1/files/${up.body.id}`).expect(404);
    await (await as('jana.m')).get(`/api/v1/documents/${doc.body.id}`).expect(404);
  });

  test('Aufgaben: Mitarbeitende vergeben keine Aufgaben an andere; Erledigt meldet zurück', async () => {
    const jana = await as('jana.m');
    const maren = await as('maren.h');
    const tobiasId = (await prisma.db.user.findUniqueOrThrow({ where: { username: 'tobias.k' } })).id;
    await jana.post('/api/v1/tasks').send({ title: 'Für Tobias', userId: tobiasId }).expect(403);
    await maren.post('/api/v1/tasks').send({ title: 'Für die Küche', groupId: await groupId('Küche') }).expect(403); // Teamleitung nur eigenes Team
    const t = await maren.post('/api/v1/tasks').send({ title: 'Servietten falten', groupId: await groupId('Service') }).expect(201);
    const tobias = await as('tobias.k');
    expect((await tobias.get('/api/v1/tasks').expect(200)).body.tasks.some((x: { id: string }) => x.id === t.body.id)).toBe(true);
    await jana.patch(`/api/v1/tasks/${t.body.id}`).send({ status: 'DONE' }).expect(404);
    await tobias.patch(`/api/v1/tasks/${t.body.id}`).send({ status: 'DONE' }).expect(200);
    const marenId = (await prisma.db.user.findUniqueOrThrow({ where: { username: 'maren.h' } })).id;
    expect(await prisma.db.notification.count({ where: { recipientId: marenId, eventType: 'task.done' } })).toBe(1);
  });

  test('Checklisten: Grenzwert, Pflichtnotiz bei Abweichung, Meldung an die Teamleitung; Stiftung ohne Modul', async () => {
    const jana = await as('jana.m');
    const sven = await as('sven.r');
    const tpl = await prisma.db.checklist.findFirstOrThrow({ where: { title: 'Kühlräume morgens' } });
    await jana.post(`/api/v1/checklists/${tpl.id}/start`).expect(404); // nicht ihr Team
    const run = (await sven.post(`/api/v1/checklists/${tpl.id}/start`).expect(201)).body.id;
    let r = (await sven.get(`/api/v1/checklists/runs/${run}`).expect(200)).body;
    const item = (t: string) => r.items.find((i: { title: string }) => i.title === t).id;
    r = (await sven.patch(`/api/v1/checklists/runs/${run}/items/${item('Kühlraum 1')}`).send({ value: '7,5' }).expect(200)).body;
    expect(r.items.find((i: { title: string }) => i.title === 'Kühlraum 1').outOfRange).toBe(true);
    for (const [t, v] of [['Tiefkühlraum', '-20'], ['Kühlschrank Patisserie', '4'], ['Türdichtungen sauber und dicht', 'Ja']]) {
      r = (await sven.patch(`/api/v1/checklists/runs/${run}/items/${item(t)}`).send({ value: v }).expect(200)).body;
    }
    await sven.post(`/api/v1/checklists/runs/${run}/complete`).expect(400); // Notiz fehlt
    await sven.patch(`/api/v1/checklists/runs/${run}/items/${item('Kühlraum 1')}`).send({ note: 'Techniker gerufen' }).expect(200);
    expect((await sven.post(`/api/v1/checklists/runs/${run}/complete`).expect(200)).body.deviations).toBe(1);
    await (await as('nora.s')).get('/api/v1/checklists').expect(403);
  });

  test('Umfragen: anonym ohne Personenbezug, einmalig, Ergebnisse erst ab 5 Antworten', async () => {
    const id = (await prisma.db.survey.findFirstOrThrow({ where: { title: { startsWith: 'Wie zufrieden' } } })).id;
    const q = await prisma.db.surveyQuestion.findMany({ where: { surveyId: id }, include: { options: true }, orderBy: { sortOrder: 'asc' } });
    const jana = await as('jana.m');
    await jana.get(`/api/v1/surveys/${id}/results`).expect(403);
    const answers = [{ questionId: q[0].id, value: 5 }, { questionId: q[1].id, optionIds: [q[1].options[0].id] }];
    await jana.post(`/api/v1/surveys/${id}/responses`).send({ answers }).expect(201);
    await jana.post(`/api/v1/surveys/${id}/responses`).send({ answers }).expect(409);
    expect(await prisma.db.surveyResponse.count({ where: { surveyId: id, respondentId: { not: null } } })).toBe(0);
    const res = (await (await as('lena.k')).get(`/api/v1/surveys/${id}/results`).expect(200)).body;
    expect(res.responses).toBe(7);
    expect(res.questions[0].average).toBeGreaterThan(3);
    const maren = await as('maren.h');
    const s = await maren.post('/api/v1/surveys').send({ title: 'Kurzer Test', audience: [`G:${await groupId('Service')}`], questions: [{ prompt: 'Passt alles?', type: 'SCALE' }] }).expect(201);
    expect((await maren.get(`/api/v1/surveys/${s.body.id}/results`).expect(200)).body.tooFew).toBe(true);
  });

  test('Ideen: alle reichen ein, nur Leitungen ändern den Status', async () => {
    const jana = await as('jana.m');
    const i = await jana.post('/api/v1/ideas').send({ title: 'Fahrradständer am Personaleingang', description: 'Damit wir nicht am Zaun anschließen müssen.' }).expect(201);
    await jana.patch(`/api/v1/ideas/${i.body.id}/status`).send({ status: 'ACCEPTED' }).expect(403);
    await (await as('sven.r')).patch(`/api/v1/ideas/${i.body.id}/status`).send({ status: 'ACCEPTED', note: 'Gute Idee' }).expect(200);
    const d = (await jana.get(`/api/v1/ideas/${i.body.id}`).expect(200)).body;
    expect(d.history.map((h: { status: string }) => h.status)).toEqual(['SUBMITTED', 'ACCEPTED']);
  });

  test('Kontakte: lesen alle, pflegen nur Berechtigte; Externe ohne Modul', async () => {
    const jana = await as('jana.m');
    const list = (await jana.get('/api/v1/contacts?q=Kälte').expect(200)).body;
    expect(list.contacts[0].emergencyPhone).toBeTruthy();
    await jana.post('/api/v1/contacts').send({ organizationName: 'Test', type: 'OTHER' }).expect(403);
    await (await as('sven.r')).post('/api/v1/contacts').send({ organizationName: 'Fischhandel Beispiel', type: 'SUPPLIER', phone: '0' }).expect(201);
    await (await as('tom.b.extern')).get('/api/v1/contacts').expect(403);
  });

  test('Lesestatus für alle dienstlichen Einträge, Umfrage = Teilnahme, nie für Social (ADR-042)', async () => {
    const lena = await as('lena.k');
    const tobias = await as('tobias.k');
    const doc = (await prisma.db.document.findFirstOrThrow({ where: { title: 'Urlaubsantrag' }, include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } }));
    await tobias.get(`/api/v1/files/${doc.versions[0].fileObjectId}`).expect(200); // Öffnen zählt als gelesen
    const st = (await lena.get(`/api/v1/content/${doc.id}/read-status?details=1`).expect(200)).body;
    expect(st).toMatchObject({ enabled: true, visible: true });
    expect(st.people.find((p: { name: string }) => p.name === 'Tobias K.').readOn).toBeTruthy();
    expect(st.people.find((p: { name: string }) => p.name === 'Jana M.').readOn).toBeNull();
    const survey = (await prisma.db.survey.findFirstOrThrow({ where: { title: { startsWith: 'Wie zufrieden' } } })).id;
    const sv = (await lena.get(`/api/v1/content/${survey}/read-status?details=1`).expect(200)).body;
    expect(sv.read).toBeGreaterThanOrEqual(6); // Teilnahmen, Antworten bleiben anonym
    await (await as('jana.m')).get(`/api/v1/content/${doc.id}/read-status?details=1`).expect(200).expect((r) => expect(r.body.visible).toBe(false));
    // Teamleitung sieht den Status von Einträgen an ihr Team, auch wenn sie nicht von ihr sind
    const handover = (await prisma.db.handover.findFirstOrThrow({ where: { subject: { startsWith: 'Hochzeit Samstag' } } })).id;
    const hs = (await (await as('maren.h')).get(`/api/v1/content/${handover}/read-status?details=1`).expect(200)).body;
    expect(hs).toMatchObject({ visible: true, canRemind: true });
    expect(hs.people.length).toBeGreaterThan(0);
    expect((await (await as('ana.f')).get(`/api/v1/content/${handover}/read-status`).expect(200)).body.visible).toBe(false);
    const social = (await prisma.db.post.findFirstOrThrow({ where: { kind: 'SOCIAL' } })).id;
    expect((await lena.get(`/api/v1/content/${social}/read-status`).expect(200)).body.enabled).toBe(false);
  });

  test('Lesestatus in Listen: nur für Autor:in und Leitungen, nie Social', async () => {
    const ids = (await prisma.db.contentItem.findMany({ where: { type: { in: ['POST', 'HANDOVER', 'SURVEY'] } }, select: { id: true } })).map((i) => i.id);
    const sven = (await (await as('sven.r')).post('/api/v1/content/read-summaries').send({ ids }).expect(200)).body;
    const social = (await prisma.db.post.findMany({ where: { kind: 'SOCIAL' }, select: { id: true } })).map((p) => p.id);
    expect(Object.keys(sven).length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(sven).some((id) => social.includes(id))).toBe(false);
    const survey = (await prisma.db.survey.findFirstOrThrow({ where: { title: { startsWith: 'Wie zufrieden' } } })).id;
    expect(sven[survey].read).toBeGreaterThanOrEqual(6); // Teilnahmen
    const jana = (await (await as('jana.m')).post('/api/v1/content/read-summaries').send({ ids }).expect(200)).body;
    const janaOwn = (await prisma.db.contentItem.findMany({ where: { author: { username: 'jana.m' }, id: { in: ids } }, select: { id: true } })).map((i) => i.id);
    expect(Object.keys(jana).every((id) => janaOwn.includes(id))).toBe(true);
  });

  test('Dokument-Kategorien: anlegen, vertraulich vererbt, verschieben, nicht leer ausblenden', async () => {
    const sven = await as('sven.r');
    await (await as('jana.m')).post('/api/v1/documents/categories').send({ name: 'Test' }).expect(403);
    const hr = (await prisma.db.documentCategory.findFirstOrThrow({ where: { name: 'Personal (vertraulich)' } })).id;
    const sub = (await (await as('lena.k')).post('/api/v1/documents/categories').send({ name: 'Zeugnisse', parentId: hr }).expect(201)).body.id;
    const list = (await sven.get('/api/v1/documents').expect(200)).body;
    expect(list.canManage).toBe(true);
    expect(list.categories.find((c: { name: string }) => c.name === 'Urlaub & Abwesenheit').path).toBe('Vorlagen & Formulare › Urlaub & Abwesenheit');
    // Dokument in vertrauliche Unterkategorie verschieben → aus der Suche
    const doc = (await prisma.db.document.findFirstOrThrow({ where: { title: 'Temperaturliste Kühlräume' } })).id;
    expect((await sven.get('/api/v1/search?q=Temperaturliste').expect(200)).body.results.length).toBe(1);
    await sven.patch(`/api/v1/documents/${doc}`).send({ categoryId: sub }).expect(200);
    expect((await sven.get('/api/v1/search?q=Temperaturliste').expect(200)).body.results.length).toBe(0);
    expect((await sven.get('/api/v1/documents').expect(200)).body.categories.find((c: { id: string }) => c.id === sub).sensitive).toBe(true);
    await sven.patch(`/api/v1/documents/categories/${sub}`).send({ isActive: false }).expect(400); // nicht leer
  });

  test('Team: Personen in der Suche, Profil mit Kontaktdaten, eigene Abwesenheit sichtbar in Team, Chat und Übergaben (ADR-046)', async () => {
    const jana = await as('jana.m');
    const maren = await prisma.db.user.findUniqueOrThrow({ where: { username: 'maren.h' } });
    const found = (await jana.get('/api/v1/search?q=Hofmann').expect(200)).body.people;
    expect(found[0]).toMatchObject({ name: 'Maren H.' });
    expect(found[0].absent).toMatchObject({ label: 'im Urlaub', note: 'Vertretung: Tobias K.' });
    const p = (await jana.get(`/api/v1/people/${maren.id}`).expect(200)).body;
    expect(p).toMatchObject({ email: 'maren.hofmann@sgl.example', phoneMobile: '0170 000 1210' });
    expect(p.absences).toHaveLength(1);
    expect((await jana.get('/api/v1/people/directory').expect(200)).body.find((x: { id: string }) => x.id === maren.id).absent.label).toBe('im Urlaub');
    await (await as('tom.b.extern')).get(`/api/v1/people/${maren.id}`).expect(403); // Externe ohne Verzeichnis
    // Übergabe an Service → Hinweis, wer abwesend ist
    const away = (await jana.post('/api/v1/people/absent').send({ targets: [`G:${await groupId('Service')}`] }).expect(200)).body;
    expect(away.map((a: { name: string }) => a.name)).toEqual(['Maren H.']);
    // Chat mit Maren zeigt die Abwesenheit
    const chat = (await jana.post('/api/v1/chat/direct').send({ userId: maren.id }).expect(201)).body.id;
    expect((await jana.get(`/api/v1/chat/${chat}`).expect(200)).body.absent[0]).toMatchObject({ name: 'Maren H.', label: 'im Urlaub' });
    // eigenes Profil und eigene Abwesenheit pflegen
    const today = new Date().toISOString().slice(0, 10);
    const mine = (await jana.post('/api/v1/people/me/absences').send({ type: 'BUSINESS_TRIP', startsOn: today, endsOn: today, note: 'Messe' }).expect(201)).body;
    expect(mine.absences).toHaveLength(1);
    await jana.post('/api/v1/people/me/absences').send({ type: 'SICK', startsOn: today, endsOn: today }).expect(400); // keine Gründe wie Krankheit
    await jana.put('/api/v1/people/me/profile').send({ phoneWork: '-101', email: 'maren.hofmann@sgl.example' }).expect(400); // E-Mail vergeben
    expect((await jana.put('/api/v1/people/me/profile').send({ phoneWork: '-101', phoneMobile: '' }).expect(200)).body.phoneWork).toBe('-101');
    await jana.delete(`/api/v1/people/me/absences/${mine.absences[0].id}`).expect(200);
  });
});

/**
 * Neue Funktionen (ADR-043): Push mit Ruhezeit, Hintergrund-Erinnerungen, wiederkehrende Checklisten,
 * Freigabe im Vier-Augen-Prinzip, Ein-/Austrittspläne.
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { PrismaService } from '../src/common/prisma.service';
import { PushService, inQuietHours } from '../src/notifications/push.service';
import { JobsService } from '../src/work/jobs.service';
import { nextOccurrence } from '../src/work/recurrence';
import { config } from '../src/common/config';

jest.setTimeout(90_000);
const PW = 'Wir-Demo-2026';

describe('Wiederholung und Ruhezeit (Einheit)', () => {
  test('täglich 06:00 Berlin – Sommer- und Winterzeit', () => {
    expect(nextOccurrence('FREQ=DAILY;BYHOUR=6;BYMINUTE=0', new Date('2026-07-01T05:00:00Z')).toISOString()).toBe('2026-07-02T04:00:00.000Z');
    expect(nextOccurrence('FREQ=DAILY;BYHOUR=6;BYMINUTE=0', new Date('2026-12-01T03:00:00Z')).toISOString()).toBe('2026-12-01T05:00:00.000Z');
  });
  test('Mo–Fr überspringt das Wochenende', () => {
    // Fr 2026-10-09 10:00 → Mo 2026-10-12 06:00 (UTC+2)
    expect(nextOccurrence('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=6;BYMINUTE=0', new Date('2026-10-09T08:00:00Z')).toISOString()).toBe('2026-10-12T04:00:00.000Z');
  });
  test('Ruhezeit über Mitternacht', () => {
    expect(inQuietHours('23:30', '21:00', '07:00')).toBe(true);
    expect(inQuietHours('06:59', '21:00', '07:00')).toBe(true);
    expect(inQuietHours('12:00', '21:00', '07:00')).toBe(false);
    expect(inQuietHours('12:00', null, null)).toBe(false);
  });
});

describe('Neue Funktionen (e2e)', () => {
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
  const uid = async (u: string) => (await prisma.db.user.findUniqueOrThrow({ where: { username: u } })).id;
  const count = (recipientId: string, eventType: string) => prisma.db.notification.count({ where: { recipientId, eventType } });

  beforeAll(async () => {
    execSync('npx tsx prisma/seed.ts', { cwd: path.resolve(__dirname, '../../../packages/db'), stdio: 'ignore', env: process.env });
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => app?.close());

  test('Push: Gerät anmelden, Benachrichtigung kommt an – nicht in der Ruhezeit', async () => {
    const push = app.get(PushService);
    const sent: Array<{ endpoint: string; payload: string }> = [];
    push.transport = async (sub, payload) => { sent.push({ endpoint: sub.endpoint, payload }); };
    const jana = await as('jana.m');
    expect((await jana.get('/api/v1/notifications/push/key').expect(200)).body.publicKey).toHaveLength(87);
    await jana.post('/api/v1/notifications/push/subscriptions').send({ endpoint: 'https://push.example/jana', keys: { p256dh: 'x', auth: 'y' } }).expect(200);
    await (await as('sven.r')).post('/api/v1/tasks').send({ title: 'Allergenordner prüfen', userId: await uid('jana.m') }).expect(201);
    await new Promise((r) => setTimeout(r, 300));
    expect(sent.some((s) => s.endpoint === 'https://push.example/jana' && JSON.parse(s.payload).title.includes('Allergenordner'))).toBe(true);
    // Ruhezeit rund um die Uhr → kein Push, aber in der App
    const now = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Berlin' }).format(new Date());
    const later = `${String((Number(now.slice(0, 2)) + 1) % 24).padStart(2, '0')}:00`;
    await jana.patch('/api/v1/me/settings').send({ quietHoursStart: `${now.slice(0, 2)}:00`, quietHoursEnd: later }).expect(200);
    sent.length = 0;
    await (await as('sven.r')).post('/api/v1/tasks').send({ title: 'Nachts nicht stören', userId: await uid('jana.m') }).expect(201);
    await new Promise((r) => setTimeout(r, 300));
    expect(sent).toHaveLength(0);
    expect(await prisma.db.notification.count({ where: { recipientId: await uid('jana.m'), title: { contains: 'Nachts nicht stören' } } })).toBe(1);
    await jana.delete('/api/v1/notifications/push/subscriptions').send({ endpoint: 'https://push.example/jana' }).expect(200);
  });

  test('Job: wiederkehrende HACCP-Checkliste startet einmal, wird überfällig und meldet sich', async () => {
    const jobs = app.get(JobsService);
    const t = await prisma.db.checklist.findFirstOrThrow({ where: { title: 'HACCP Kühlräume morgens' } });
    await prisma.db.checklist.update({ where: { id: t.id }, data: { nextRunAt: new Date(Date.now() - 60_000) } });
    const before = await prisma.db.checklistRun.count({ where: { checklistId: t.id } });
    await jobs.run();
    await jobs.run(); // zweiter Lauf darf nichts doppelt anlegen
    expect(await prisma.db.checklistRun.count({ where: { checklistId: t.id } })).toBe(before + 1);
    expect((await prisma.db.checklist.findUniqueOrThrow({ where: { id: t.id } })).nextRunAt!.getTime()).toBeGreaterThan(Date.now());
    await jobs.run(new Date(Date.now() + 5 * 3600_000)); // 5 h später
    const newest = await prisma.db.checklistRun.findFirstOrThrow({ where: { checklistId: t.id, dueAt: { not: null } } });
    expect(newest.status).toBe('OVERDUE');
    expect(await count(await uid('sven.r'), 'checklist.overdue')).toBe(1);
  });

  test('Job: Aufgabe bald fällig und offene Bestätigung – je einmal', async () => {
    const jobs = app.get(JobsService);
    const jana = await uid('jana.m');
    const t = (await (await as('sven.r')).post('/api/v1/tasks').send({ title: 'Kassenbericht abgeben', userId: jana, dueAt: new Date(Date.now() + 2 * 3600_000).toISOString() }).expect(201)).body.id;
    // Kühlkette: aktuelle Version auf vor 4 Tagen setzen – Tobias hat bestätigt, Ana nicht
    const kk = (await prisma.db.knowledgeVersion.findFirstOrThrow({ where: { title: { startsWith: 'Kühlkette' }, status: 'PUBLISHED' } }));
    await prisma.db.knowledgeVersion.update({ where: { id: kk.id }, data: { publishedAt: new Date(Date.now() - 96 * 3600_000) } });
    await jobs.run();
    await jobs.run();
    expect(await prisma.db.notification.count({ where: { recipientId: jana, dedupeKey: `task-due:${t}` } })).toBe(1);
    const ack = (u: string) => prisma.db.notification.count({ where: { recipientId: u, dedupeKey: { startsWith: `ack:${kk.articleId}` } } });
    expect(await ack(await uid('ana.f'))).toBe(1);
    expect(await ack(await uid('tobias.k'))).toBe(0);
  });

  test('Freigabe: Vier-Augen-Prinzip, Zurückweisen öffnet den Lauf wieder', async () => {
    const tobias = await as('tobias.k');
    const maren = await as('maren.h');
    const t = await prisma.db.checklist.findFirstOrThrow({ where: { title: 'Bankett Aufbau Schlosssaal' } });
    const id = (await tobias.post(`/api/v1/checklists/${t.id}/start`).expect(201)).body.id;
    let r = (await tobias.get(`/api/v1/checklists/runs/${id}`).expect(200)).body;
    for (const it of r.items) r = (await tobias.patch(`/api/v1/checklists/runs/${id}/items/${it.id}`).send(it.type === 'YES_NO' ? { value: 'Ja' } : { done: true }).expect(200)).body;
    await tobias.post(`/api/v1/checklists/runs/${id}/complete`).expect(200);
    expect((await maren.get(`/api/v1/checklists/runs/${id}`).expect(200)).body).toMatchObject({ approval: 'PENDING', canApprove: true });
    await tobias.post(`/api/v1/checklists/runs/${id}/approve`).send({ approve: true }).expect(403); // eigene + kein Recht
    r = (await maren.post(`/api/v1/checklists/runs/${id}/approve`).send({ approve: false, note: 'Allergenkarte Tisch 4 fehlt' }).expect(200)).body;
    expect(r).toMatchObject({ status: 'IN_PROGRESS', approval: 'NOT_REQUIRED' });
    await tobias.post(`/api/v1/checklists/runs/${id}/complete`).expect(200);
    r = (await maren.post(`/api/v1/checklists/runs/${id}/approve`).send({ approve: true }).expect(200)).body;
    expect(r).toMatchObject({ approval: 'APPROVED', approvedBy: 'Maren H.' });
  });

  test('Einarbeitung: Plan erzeugt Aufgaben, gibt Pflichtlektüre frei und schließt sich selbst ab', async () => {
    const lena = await as('lena.k');
    await (await as('jana.m')).get('/api/v1/onboarding/options').expect(403);
    const opts = (await lena.get('/api/v1/onboarding/options').expect(200)).body;
    const tpl = opts.templates.find((t: { name: string }) => t.name.startsWith('Einarbeitung'));
    const tobiasId = await uid('tobias.k');
    const plan = (await lena.post('/api/v1/onboarding').send({ templateId: tpl.id, userId: tobiasId, referenceDate: new Date().toISOString().slice(0, 10) }).expect(201)).body.id;
    const tobias = await as('tobias.k');
    const p = (await tobias.get(`/api/v1/onboarding/${plan}`).expect(200)).body;
    expect(p.steps).toHaveLength(6);
    expect(p.steps.filter((s: { forPerson: boolean; assignee: string }) => !s.forPerson).every((s: { assignee: string }) => s.assignee === 'Maren H.')).toBe(true); // Teamleitung Service
    expect(await count(tobiasId, 'lifecycle.started')).toBe(1);
    // Pflichtlektüre „Erste Hilfe“ ist für Tobias sichtbar
    const ersteHilfe = (await prisma.db.knowledgeVersion.findFirstOrThrow({ where: { title: 'Erste Hilfe und Notfälle' } })).articleId;
    await tobias.get(`/api/v1/knowledge/${ersteHilfe}`).expect(200);
    await (await as('ana.f')).get(`/api/v1/onboarding/${plan}`).expect(404);
    // alle Schritte erledigen → Plan abgeschlossen
    const maren = await as('maren.h');
    for (const s of p.steps) await (s.forPerson ? tobias : maren).patch(`/api/v1/tasks/${s.id}`).send({ status: 'DONE' }).expect(200);
    expect((await lena.get(`/api/v1/onboarding/${plan}`).expect(200)).body.status).toBe('COMPLETED');
  });

  test('Demo-Modus: nur mit Schalter und Testdaten-Marker, wechselt ohne Passwort (ADR-047)', async () => {
    const a = request.agent(app.getHttpServer());
    const users = (await a.get('/api/v1/auth/demo').expect(200)).body;
    const sven = users.find((u: { username: string }) => u.username === 'sven.r');
    expect(sven.roles).toContain('Abteilungsleitung');
    expect(users.some((u: { username: string }) => u.username === 'paula.s')).toBe(false); // nur aktive
    await a.post('/api/v1/auth/demo/login').send({ userId: sven.id }).expect(200);
    expect((await a.get('/api/v1/me').expect(200)).body.user.username).toBe('sven.r');
    const jana = users.find((u: { username: string }) => u.username === 'jana.m');
    await a.post('/api/v1/auth/demo/login').send({ userId: jana.id }).expect(200);
    expect((await a.get('/api/v1/me').expect(200)).body.user.username).toBe('jana.m');
    // ohne Testdaten-Marker (z. B. echte Datenbank) → gibt es nicht
    await prisma.db.systemSetting.delete({ where: { key: 'demo.seeded' } });
    await a.get('/api/v1/auth/demo').expect(404);
    await prisma.db.systemSetting.create({ data: { key: 'demo.seeded', value: true } });
    // ohne Schalter → gibt es nicht
    config.demoMode = false;
    await a.post('/api/v1/auth/demo/login').send({ userId: sven.id }).expect(404);
    config.demoMode = true;
  });

  test('Chat-Reaktionen: 👍 👎 ❤️ 🎉 umschalten, nur für Teilnehmende (ADR-048)', async () => {
    const jana = await as('jana.m');
    const conv = (await jana.get('/api/v1/chat').expect(200)).body.find((c: { title: string }) => c.title === 'Team Rezeption');
    const msg = (await jana.get(`/api/v1/chat/${conv.id}`).expect(200)).body.messages[0];
    await jana.post(`/api/v1/chat/messages/${msg.id}/reactions`).send({ type: 'CELEBRATE' }).expect(200);
    await (await as('selin.a')).post(`/api/v1/chat/messages/${msg.id}/reactions`).send({ type: 'CELEBRATE' }).expect(200);
    await jana.post(`/api/v1/chat/messages/${msg.id}/reactions`).send({ type: 'HEART' }).expect(200);
    let m = (await jana.get(`/api/v1/chat/${conv.id}`).expect(200)).body.messages.find((x: { id: string }) => x.id === msg.id);
    expect(m.reactions).toEqual([{ type: 'HEART', count: 1, mine: true, names: ['Jana M.'] }, { type: 'CELEBRATE', count: 2, mine: true, names: expect.arrayContaining(['Jana M.', 'Selin A.']) }]);
    await jana.post(`/api/v1/chat/messages/${msg.id}/reactions`).send({ type: 'HEART' }).expect(200); // wieder aus
    m = (await jana.get(`/api/v1/chat/${conv.id}`).expect(200)).body.messages.find((x: { id: string }) => x.id === msg.id);
    expect(m.reactions.map((r: { type: string }) => r.type)).toEqual(['CELEBRATE']);
    await jana.post(`/api/v1/chat/messages/${msg.id}/reactions`).send({ type: 'LIKE' }).expect(400);
    await (await as('sven.r')).post(`/api/v1/chat/messages/${msg.id}/reactions`).send({ type: 'HEART' }).expect((r) => expect([403, 404]).toContain(r.status));
  });
});

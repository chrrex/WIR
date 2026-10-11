/**
 * Neue Funktionen (ADR-043): Push mit Ruhezeit, Hintergrund-Erinnerungen, wiederkehrende Checklisten,
 * Freigabe im Vier-Augen-Prinzip, Ein-/Austrittspläne.
 */
import sharp from 'sharp';
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
import { ContentService } from '../src/content/content.service';
import { TranslateService } from '../src/translate/translate.service';
import { nextOccurrence } from '../src/work/recurrence';
import { config } from '../src/common/config';
import { berlinMidnight } from '../src/dashboard/house';

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
  test('Mitternacht in Berlin – Sommer- und Winterzeit (ADR-057)', () => {
    expect(berlinMidnight(0, new Date('2026-10-11T22:30:00Z')).toISOString()).toBe('2026-10-11T22:00:00.000Z');
    expect(berlinMidnight(1, new Date('2026-12-01T12:00:00Z')).toISOString()).toBe('2026-12-01T23:00:00.000Z');
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

  test('Reaktionen bei News und Social (ADR-048)', async () => {
    const jana = await as('jana.m');
    const news = (await jana.get('/api/v1/news').expect(200)).body[0];
    const before = news.reactions.find((r: { type: string }) => r.type === 'THUMBS_DOWN')?.count ?? 0;
    const r1 = await jana.post(`/api/v1/content/${news.id}/reactions`).send({ type: 'THUMBS_DOWN' }).expect(200);
    expect(r1.body.reactions.find((r: { type: string }) => r.type === 'THUMBS_DOWN')).toMatchObject({ count: before + 1, mine: true });
    const detail = (await jana.get(`/api/v1/news/${news.id}`).expect(200)).body;
    expect(detail.reactions.find((r: { type: string }) => r.type === 'THUMBS_DOWN').mine).toBe(true);
    await jana.post(`/api/v1/content/${news.id}/reactions`).send({ type: 'THUMBS_DOWN' }).expect(200); // wieder aus
    const post = (await jana.get('/api/v1/social').expect(200)).body[0];
    const r2 = await jana.post(`/api/v1/content/${post.id}/reactions`).send({ type: 'CELEBRATE' }).expect(200);
    expect(r2.body.reactions.some((r: { type: string; mine: boolean }) => r.type === 'CELEBRATE' && r.mine)).toBe(true);
    await jana.post(`/api/v1/content/${post.id}/reactions`).send({ type: 'LIKE' }).expect(400);
  });

  test('Profilfoto: hochladen (256 px quadratisch), für Kolleg:innen sichtbar, entfernen', async () => {
    const jana = await as('jana.m');
    const me = (await jana.get('/api/v1/me').expect(200)).body.user;
    const png = await sharp({ create: { width: 800, height: 400, channels: 3, background: '#6B7A3E' } }).png().toBuffer();
    await jana.post('/api/v1/files/avatar').attach('file', Buffer.from('kein Bild'), 'x.png').expect(400);
    await jana.post('/api/v1/files/avatar').attach('file', png, { filename: 'ich.png', contentType: 'image/png' }).expect(200);
    expect((await jana.get('/api/v1/people/me/profile').expect(200)).body.photo).toBe(true);
    const img = await (await as('sven.r')).get(`/api/v1/files/avatar/${me.id}`).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
    expect(await sharp(img.body).metadata()).toMatchObject({ width: 256, height: 256, format: 'webp' });
    await jana.delete('/api/v1/files/avatar').expect(204);
    await jana.get(`/api/v1/files/avatar/${me.id}`).expect(404);
  });

  test('News geplant: erst später sichtbar, dann mit Benachrichtigung (ADR-050)', async () => {
    const maren = await as('maren.h');
    const sgl = (await prisma.db.company.findFirstOrThrow({ where: { name: { contains: 'Liebenberg' } } })).id;
    const at = new Date(Date.now() + 2 * 3600_000).toISOString();
    await maren.post('/api/v1/news').send({ title: 'Geplant: Weihnachtsfeier', text: 'Infos folgen.', targets: [`C:${sgl}`], publishAt: new Date(Date.now() - 1000).toISOString() }).expect(400);
    const { id } = (await maren.post('/api/v1/news').send({ title: 'Geplant: Weihnachtsfeier', text: 'Infos folgen.', targets: [`C:${sgl}`], important: true, publishAt: at }).expect(201)).body;
    expect((await maren.get('/api/v1/news').expect(200)).body.find((n: { id: string }) => n.id === id).scheduledFor).toBeTruthy();
    const jana = await as('jana.m');
    await jana.get(`/api/v1/news/${id}`).expect(404);
    expect(await prisma.db.notification.count({ where: { contentItemId: id } })).toBe(0);
    await app.get(ContentService).publishDue(new Date(Date.now() + 3 * 3600_000));
    expect((await jana.get(`/api/v1/news/${id}`).expect(200)).body.scheduledFor).toBeNull();
    expect(await prisma.db.notification.count({ where: { contentItemId: id, recipientId: await uid('jana.m') } })).toBe(1);
  });

  test('Abstimmung in News und Übergaben: abstimmen, ändern, eine Antwort (ADR-050)', async () => {
    const maren = await as('maren.h');
    const sgl = (await prisma.db.company.findFirstOrThrow({ where: { name: { contains: 'Liebenberg' } } })).id;
    const { id } = (await maren.post('/api/v1/news').send({ title: 'Termin Weihnachtsfeier', text: 'Stimmt ab!', targets: [`C:${sgl}`], poll: { question: 'Welcher Termin?', options: ['12.12.', '19.12.'] } }).expect(201)).body;
    const jana = await as('jana.m');
    const poll = (await jana.get(`/api/v1/news/${id}`).expect(200)).body.poll;
    expect(poll).toMatchObject({ question: 'Welcher Termin?', voted: false, voters: 0 });
    await jana.post(`/api/v1/content/${id}/poll`).send({ optionIds: poll.options.map((o: { id: string }) => o.id) }).expect(400);
    await jana.post(`/api/v1/content/${id}/poll`).send({ optionIds: [poll.options[0].id] }).expect(200);
    const after = (await jana.post(`/api/v1/content/${id}/poll`).send({ optionIds: [poll.options[1].id] }).expect(200)).body;
    expect(after.options.map((o: { count: number }) => o.count)).toEqual([0, 1]);
    expect(after.options[1]).toMatchObject({ mine: true, names: ['Jana M.'] });
    expect((await jana.get('/api/v1/news').expect(200)).body.find((n: { id: string }) => n.id === id).hasPoll).toBe(true);
    const sven = await as('sven.r');
    const kitchen = (await prisma.db.group.findFirstOrThrow({ where: { name: 'Küche' } })).id;
    const h = (await sven.post('/api/v1/handovers').send({ targets: [`G:${kitchen}`], shiftLabel: 'Früh', subject: 'Wer übernimmt Samstag?', text: 'Bitte abstimmen.', poll: { question: 'Wer kann?', options: ['Ich', 'Ich nicht'], multiple: true } }).expect(201)).body;
    expect((await sven.get(`/api/v1/handovers/${h.id}`).expect(200)).body.poll.multiple).toBe(true);
  });

  test('Lesezeichen: merken, Liste, wieder entfernen', async () => {
    const jana = await as('jana.m');
    const news = (await jana.get('/api/v1/news').expect(200)).body[0];
    expect((await jana.post(`/api/v1/content/${news.id}/bookmark`).expect(200)).body.bookmarked).toBe(true);
    expect((await jana.get(`/api/v1/content/${news.id}/bookmark`).expect(200)).body.bookmarked).toBe(true);
    const list = (await jana.get('/api/v1/bookmarks').expect(200)).body;
    expect(list[0]).toMatchObject({ id: news.id, type: 'NEWS', href: `/news/${news.id}`, title: news.title });
    expect((await (await as('sven.r')).get('/api/v1/bookmarks').expect(200)).body.some((b: { id: string }) => b.id === news.id)).toBe(false);
    await jana.post(`/api/v1/content/${news.id}/bookmark`).expect(200);
    expect((await jana.get('/api/v1/bookmarks').expect(200)).body).toHaveLength(0);
  });

  test('Danke-Karten: öffentlich und privat, Push an Bedankte, Sammlung, Monatszahl (ADR-051)', async () => {
    const jana = await as('jana.m');
    const opts = (await jana.get('/api/v1/social/thanks/options').expect(200)).body;
    expect(Object.keys(opts.motifs)).toEqual(['HOST', 'TEAM', 'HELP', 'GREEN', 'WIR']);
    const hk = opts.groups.find((g: { name: string }) => g.name.startsWith('Housekeeping')).id;
    await jana.post('/api/v1/social/thanks').send({ motif: 'TEAM', text: 'Danke!' }).expect(400);
    const pub = (await jana.post('/api/v1/social/thanks').send({ userIds: [await uid('sven.r')], groupId: hk, motif: 'HELP', text: 'Danke für die schnelle Zimmerfreigabe!' }).expect(201)).body;
    const sven = await as('sven.r');
    expect(await count(await uid('sven.r'), 'thanks')).toBe(1);
    const card = (await (await as('lena.k')).get(`/api/v1/social/${pub.id}`).expect(200)).body;
    expect(card).toMatchObject({ category: 'THANKS', title: 'Danke, Sven R. und Team Housekeeping!', kudos: { motif: 'HELP', team: 'Housekeeping', private: false, to: [{ name: 'Sven R.' }] } });
    const priv = (await jana.post('/api/v1/social/thanks').send({ userIds: [await uid('sven.r')], motif: 'HOST', text: 'Unter uns: super Abend gestern.', private: true }).expect(201)).body;
    await (await as('lena.k')).get(`/api/v1/social/${priv.id}`).expect(404);
    const mine = (await sven.get('/api/v1/social/thanks/mine').expect(200)).body;
    expect(mine.map((m: { id: string }) => m.id)).toEqual(expect.arrayContaining([pub.id, priv.id]));
    const w = (await sven.get('/api/v1/dashboard').expect(200)).body.widgets.find((x: { key: string }) => x.key === 'thanks');
    expect(w.count).toBeGreaterThanOrEqual(2);
    await jana.post('/api/v1/social').send({ title: 'x', category: 'THANKS', visibility: 'ALL' }).expect(400);
  });

  test('Danke-Karten plus: mitunterschreiben, Gästelob nur Leitungen, Erinnerung nach Veranstaltung (ADR-052)', async () => {
    const jana = await as('jana.m');
    const sven = await as('sven.r');
    const lena = await as('lena.k');
    const card = (await jana.post('/api/v1/social/thanks').send({ userIds: [await uid('sven.r')], motif: 'TEAM', text: 'Danke fürs Einspringen!' }).expect(201)).body;
    await jana.post(`/api/v1/social/thanks/${card.id}/sign`).expect(400);
    await sven.post(`/api/v1/social/thanks/${card.id}/sign`).expect(400);
    const k = (await lena.post(`/api/v1/social/thanks/${card.id}/sign`).expect(200)).body;
    expect(k).toMatchObject({ signed: true, signers: [{ name: 'Lena K.' }] });
    expect((await sven.get(`/api/v1/social/${card.id}`).expect(200)).body.kudos).toMatchObject({ forMe: true, signers: [{ name: 'Lena K.' }] });
    expect((await lena.post(`/api/v1/social/thanks/${card.id}/sign`).expect(200)).body.signers).toHaveLength(0);
    // Gästelob
    expect((await jana.get('/api/v1/social/thanks/options').expect(200)).body).toMatchObject({ leader: false });
    await jana.post('/api/v1/social/thanks').send({ userIds: [await uid('sven.r')], motif: 'GUEST', text: 'Das Essen war ein Traum!' }).expect(403);
    expect((await sven.get('/api/v1/social/thanks/options').expect(200)).body.motifs.GUEST).toBe('Gästelob');
    const g = (await sven.post('/api/v1/social/thanks').send({ userIds: [await uid('ana.f')], motif: 'GUEST', text: 'Das Menü war ein Traum!', source: 'Gästebuch' }).expect(201)).body;
    expect((await (await as('ana.f')).get(`/api/v1/social/${g.id}`).expect(200)).body.kudos).toMatchObject({ motif: 'GUEST', source: 'Gästebuch', forMe: true });
    // Erinnerung
    await jana.post('/api/v1/social/thanks/reminders').send({ occasion: 'Hochzeit Probe', dueOn: '2099-01-01' }).expect(403);
    const kitchen = (await prisma.db.group.findFirstOrThrow({ where: { name: 'Küche' } })).id;
    const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    const list = (await sven.post('/api/v1/social/thanks/reminders').send({ occasion: 'Bankett Probe', dueOn: tomorrow, groupId: kitchen }).expect(201)).body;
    expect(list[0]).toMatchObject({ occasion: 'Bankett Probe', team: 'Küche' });
    const later = new Date(`${new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10)}T08:00:00Z`);
    await app.get(JobsService).run(later);
    const n = await prisma.db.notification.findFirstOrThrow({ where: { recipientId: await uid('sven.r'), eventType: 'thanks.reminder' } });
    expect(n.title).toBe('„Bankett Probe“ ist vorbei – magst du Team Küche danken?');
    expect(n.linkPath).toContain('/social/danke?anlass=Bankett+Probe&group=');
    expect((await sven.get('/api/v1/social/thanks/reminders').expect(200)).body).toHaveLength(0);
  });

  test('Übersetzung: eigene Sprache, Leichte Sprache, Zwischenspeicher, nur Sichtbares (ADR-054)', async () => {
    const calls: string[] = [];
    app.get(TranslateService).provider = {
      translate: { name: 'test', run: async (t, target) => { calls.push(...t); return t.map((x) => `[${target}] ${x}`); } },
      plain: { name: 'test-plain', run: async (t) => t.map((x) => `[leicht] ${x}`) },
    };
    const ana = await as('ana.f');
    expect((await ana.get('/api/v1/translations/languages').expect(200)).body.languages.pl).toBe('Polski');
    await ana.patch('/api/v1/me/settings').send({ locale: 'xx' }).expect(400);
    await ana.patch('/api/v1/me/settings').send({ locale: 'pl', autoTranslate: true }).expect(200);
    const news = (await ana.get('/api/v1/news').expect(200)).body[0];
    const items = [{ entity: 'CONTENT_ITEM', id: news.id, field: 'title' }, { entity: 'CONTENT_ITEM', id: news.id, field: 'body' }];
    const r1 = (await ana.post('/api/v1/translations').send({ items }).expect(200)).body;
    expect(r1.items[0]).toMatchObject({ text: `[pl] ${news.title}`, from: 'de' });
    expect(calls).toHaveLength(2);
    await ana.post('/api/v1/translations').send({ items }).expect(200);
    expect(calls).toHaveLength(2); // aus dem Zwischenspeicher
    expect((await ana.post('/api/v1/translations').send({ items, plain: true }).expect(200)).body.items[0].text).toBe(`[leicht] ${news.title}`);
    // Was jemand nicht sehen darf, wird auch nicht übersetzt
    const hidden = (await prisma.db.contentItem.findFirstOrThrow({ where: { type: 'HANDOVER', recipients: { none: { userId: await uid('ana.f') } } } })).id;
    expect((await ana.post('/api/v1/translations').send({ items: [{ entity: 'CONTENT_ITEM', id: hidden, field: 'title' }] }).expect(200)).body.items[0].text).toBeNull();
    // Wer auf Polnisch schreibt, bekommt sein Original zurück; Deutschsprachige die Übersetzung
    const conv = (await ana.post('/api/v1/chat/direct').send({ userId: await uid('jana.m') }).expect(201)).body;
    const m = (await ana.post(`/api/v1/chat/${conv.id}/messages`).send({ text: 'Dzień dobry!' }).expect(201)).body;
    const mid = m.id ?? (await prisma.db.chatMessage.findFirstOrThrow({ where: { body: 'Dzień dobry!' } })).id;
    expect((await ana.post('/api/v1/translations').send({ items: [{ entity: 'CHAT_MESSAGE', id: mid, field: 'body' }] }).expect(200)).body.items[0]).toMatchObject({ text: 'Dzień dobry!', from: null });
    await (await as('jana.m')).patch('/api/v1/me/settings').send({ locale: 'de' }).expect(200);
    expect((await (await as('jana.m')).post('/api/v1/translations').send({ items: [{ entity: 'CHAT_MESSAGE', id: mid, field: 'body' }] }).expect(200)).body.items[0]).toMatchObject({ text: '[de] Dzień dobry!', from: 'pl' });
    await ana.patch('/api/v1/me/settings').send({ locale: 'de', autoTranslate: false }).expect(200);
  });

  test('Verwaltung: Gruppen (z. B. Azubis), Personen, Rollen, Einstellungen je Haus (ADR-055)', async () => {
    const lena = await as('lena.k');
    const sgl = (await prisma.db.company.findFirstOrThrow({ where: { shortName: 'SGL' } })).id;
    const opts = (await lena.get('/api/v1/admin/options').expect(200)).body;
    expect(opts.groupTypes).toContain('CUSTOM');
    // Gruppe „Azubis“ quer über die Teams, mit Betreuerin als Leitung
    const g = (await lena.post('/api/v1/admin/groups').send({ name: 'Azubis', type: 'CUSTOM', companyId: sgl, description: 'Alle Auszubildenden' }).expect(201)).body;
    await lena.post('/api/v1/admin/groups').send({ name: 'Überall', type: 'CUSTOM' }).expect(403); // gesellschaftsübergreifend nur global
    const jana = await uid('jana.m');
    await lena.post(`/api/v1/admin/groups/${g.id}/members`).send({ userId: await uid('ana.f') }).expect(200);
    await lena.post(`/api/v1/admin/groups/${g.id}/members`).send({ userId: jana, isLead: true }).expect(200);
    let groups = (await lena.get('/api/v1/admin/groups').expect(200)).body;
    expect(groups.find((x: { id: string }) => x.id === g.id).members).toEqual([{ id: jana, name: 'Jana M.', isLead: true }, expect.objectContaining({ name: 'Ana F.' })]);
    expect(await prisma.db.userRole.count({ where: { userId: jana, groupId: g.id, role: { key: 'team_lead' } } })).toBe(1);
    expect((await (await as('jana.m')).get('/api/v1/news/options').expect(200)).body.audiences.some((a: { label: string }) => a.label === 'Azubis')).toBe(true);
    await lena.delete(`/api/v1/admin/groups/${g.id}/members/${jana}`).expect(200);
    expect(await prisma.db.userRole.count({ where: { userId: jana, groupId: g.id } })).toBe(0);
    await (await as('jana.m')).get('/api/v1/admin/groups').expect(403);
    // Person bearbeiten und anlegen
    expect((await lena.patch(`/api/v1/admin/users/${jana}`).send({ jobTitle: 'Rezeption · Schichtleitung' }).expect(200)).body.jobTitle).toBe('Rezeption · Schichtleitung');
    await lena.post('/api/v1/admin/users').send({ firstName: 'Kai', lastName: 'Extern', username: 'kai.extern', external: true, companyId: sgl }).expect(400);
    const ext = (await lena.post('/api/v1/admin/users').send({ firstName: 'Kai', lastName: 'Extern', username: 'kai.extern', external: true, companyId: sgl, validUntil: '2099-12-31' }).expect(201)).body;
    expect(ext.code).toMatch(/^\d{3} \d{3}$/);
    const neu = (await lena.post('/api/v1/admin/users').send({ firstName: 'Mia', lastName: 'Neu', username: 'mia.n', companyId: sgl, jobTitle: 'Auszubildende Hotelfach', groupIds: [g.id] }).expect(201)).body;
    expect((await lena.get(`/api/v1/admin/users/${neu.id}`).expect(200)).body).toMatchObject({ status: 'INVITED', groups: [{ name: 'Azubis' }], roles: [{ key: 'employee' }] });
    await lena.post('/api/v1/admin/users').send({ firstName: 'Mia', lastName: 'Neu', username: 'mia.n', companyId: sgl }).expect(400);
    // Rollen vergeben – nicht sich selbst, nichts, was man selbst nicht hat
    const p = (await lena.post(`/api/v1/admin/users/${jana}/roles`).send({ roleKey: 'editor_knowledge', companyId: sgl }).expect(201)).body;
    const r = p.roles.find((x: { key: string }) => x.key === 'editor_knowledge');
    expect(r.scope).toContain('Liebenberg');
    await lena.delete(`/api/v1/admin/users/${jana}/roles/${r.id}`).expect(200);
    await lena.post(`/api/v1/admin/users/${await uid('lena.k')}/roles`).send({ roleKey: 'management', companyId: sgl }).expect(400);
    // Rollen & Rechte
    const roles = (await lena.get('/api/v1/admin/roles').expect(200)).body;
    expect(roles.permissions.length).toBeGreaterThan(80);
    await lena.post('/api/v1/admin/roles').send({ name: 'Azubi-Betreuung', permissions: ['users.delete'] }).expect(403);
    const custom = (await lena.post('/api/v1/admin/roles').send({ name: 'Azubi-Betreuung', description: 'Begleitet die Azubis', permissions: ['lifecycle.view_progress', 'tasks.create', 'tasks.assign'] }).expect(201)).body;
    await lena.patch(`/api/v1/admin/roles/${roles.roles.find((x: { key: string }) => x.key === 'employee').id}`).send({ name: 'X', permissions: [] }).expect(400);
    await lena.post(`/api/v1/admin/users/${jana}/roles`).send({ roleKey: 'custom_azubi_betreuung', groupId: g.id }).expect(201);
    await lena.delete(`/api/v1/admin/roles/${custom.id}`).expect(400); // noch vergeben
    // Einstellungen je Haus
    const c = (await lena.get('/api/v1/admin/companies').expect(200)).body.find((x: { id: string }) => x.id === sgl);
    expect(c.branding.primaryColor).toBe('#6B7A3E');
    await lena.patch(`/api/v1/admin/companies/${sgl}`).send({ branding: { primaryColor: '#E9C46A' } }).expect(400);
    expect((await lena.patch(`/api/v1/admin/companies/${sgl}`).send({ disabledModules: ['IDEAS'], branding: { footerText: 'Ein Wirkungsort der DKB STIFTUNG' } }).expect(200)).body.disabledModules).toEqual(['IDEAS']);
    expect((await (await as('jana.m')).get('/api/v1/me').expect(200)).body.modules).not.toContain('IDEAS');
    await lena.patch(`/api/v1/admin/companies/${sgl}`).send({ disabledModules: [] }).expect(200);
    groups = (await lena.get('/api/v1/admin/groups').expect(200)).body;
    expect(groups.length).toBeGreaterThan(5);
  });

  test('Checklisten für alle: anlegen, zuweisen, privat, jede:r einzeln, Bedingungen, Pflicht-Text, Folgeaufgabe (ADR-056)', async () => {
    const jana = await as('jana.m');
    const ana = await as('ana.f');
    const rez = (await prisma.db.group.findFirstOrThrow({ where: { name: 'Rezeption' } })).id;
    const anaId = await uid('ana.f');
    const tpl = {
      title: 'Lobby-Check', visibility: 'PRIVATE', completionMode: 'EACH', assignees: [`U:${anaId}`, `U:${await uid('jana.m')}`], startNow: true, dueInHours: 4,
      items: [
        { key: 'h', title: 'Eingang', type: 'HEADING' },
        { key: 'a', title: 'Zustand Teppich', type: 'CHOICE', options: ['Gut', 'Fleck', 'Schaden'], flagged: ['Schaden'], createTask: true },
        { key: 'b', title: 'Foto vom Schaden', type: 'PHOTO', showIf: { key: 'a', value: 'Schaden' } },
        { key: 'c', title: 'Blumen frisch', type: 'CHECK', requireNote: true },
        { key: 'd', title: 'Abzeichnen', type: 'SIGNATURE', required: false },
      ],
    };
    await jana.post('/api/v1/checklists/templates').send({ ...tpl, assignees: ['C:00000000-0000-0000-0000-000000000000'] }).expect((res) => expect([400, 403]).toContain(res.status));
    const created = (await jana.post('/api/v1/checklists/templates').send(tpl).expect(201)).body;
    expect(created.runs).toBe(2);
    // privat: Tobias sieht die Vorlage nicht; Ana sieht ihre eigene Liste
    expect((await (await as('tobias.k')).get('/api/v1/checklists').expect(200)).body.templates.some((t: { id: string }) => t.id === created.id)).toBe(false);
    const mine = (await ana.get('/api/v1/checklists').expect(200)).body.runs.find((r: { title: string; mine: boolean }) => r.title.startsWith('Lobby-Check') && r.mine);
    let r = (await ana.get(`/api/v1/checklists/runs/${mine.id}`).expect(200)).body;
    expect(r).toMatchObject({ mode: 'EACH', assignee: 'Ana F.', canEdit: true });
    const it = (t: string) => r.items.find((x: { title: string }) => x.title === t);
    expect(it('Foto vom Schaden').visible).toBe(false);
    // Janas Liste darf Ana nicht ausfüllen (sieht sie gar nicht)
    const other = (await jana.get('/api/v1/checklists').expect(200)).body.runs.find((x: { title: string; assignee: string }) => x.title.startsWith('Lobby-Check') && x.assignee === 'Jana M.');
    await ana.patch(`/api/v1/checklists/runs/${other.id}/items/${it('Blumen frisch').id}`).send({ done: true }).expect(404);
    await ana.patch(`/api/v1/checklists/runs/${mine.id}/items/${it('Zustand Teppich').id}`).send({ value: 'Kaputt' }).expect(400);
    r = (await ana.patch(`/api/v1/checklists/runs/${mine.id}/items/${it('Zustand Teppich').id}`).send({ value: 'Schaden' }).expect(200)).body;
    expect(it('Zustand Teppich').outOfRange).toBe(true);
    expect(r.items.find((x: { title: string }) => x.title === 'Foto vom Schaden').visible).toBe(true);
    r = (await ana.patch(`/api/v1/checklists/runs/${mine.id}/items/${it('Blumen frisch').id}`).send({ done: true }).expect(200)).body;
    expect((await ana.post(`/api/v1/checklists/runs/${mine.id}/complete`).expect(400)).body.message).toContain('Foto vom Schaden');
    // Bedingung zurück auf „Gut“: Foto nicht mehr nötig, aber Text bei „Blumen frisch“ fehlt
    await ana.patch(`/api/v1/checklists/runs/${mine.id}/items/${it('Zustand Teppich').id}`).send({ value: 'Gut' }).expect(200);
    expect((await ana.post(`/api/v1/checklists/runs/${mine.id}/complete`).expect(400)).body.message).toContain('Text fehlt');
    await ana.patch(`/api/v1/checklists/runs/${mine.id}/items/${it('Blumen frisch').id}`).send({ note: 'Neue Tulpen' }).expect(200);
    await ana.patch(`/api/v1/checklists/runs/${mine.id}/items/${it('Zustand Teppich').id}`).send({ value: 'Schaden' }).expect(200);
    const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#ccc' } }).png().toBuffer();
    const photo = (await ana.post('/api/v1/files').attach('file', png, { filename: 'p.png', contentType: 'image/png' }).expect(201)).body.id;
    await ana.patch(`/api/v1/checklists/runs/${mine.id}/items/${it('Foto vom Schaden').id}`).send({ photoFileId: photo }).expect(200);
    await ana.post(`/api/v1/checklists/runs/${mine.id}/complete`).expect(400); // kritische Antwort ohne Notiz
    await ana.patch(`/api/v1/checklists/runs/${mine.id}/items/${it('Zustand Teppich').id}`).send({ note: 'Riss am Eingang' }).expect(200);
    expect((await ana.post(`/api/v1/checklists/runs/${mine.id}/complete`).expect(200)).body.deviations).toBe(1);
    const task = await prisma.db.task.findFirstOrThrow({ where: { title: { startsWith: 'Zustand Teppich: Schaden' } } });
    expect(task.description).toContain('Riss am Eingang');
    // bearbeiten = neue Version, löschen nur Ersteller:in
    const full = (await jana.get(`/api/v1/checklists/templates/${created.id}`).expect(200)).body;
    expect(full.items[2].showIf).toEqual({ key: full.items[1].key, value: 'Schaden' });
    await ana.put(`/api/v1/checklists/templates/${created.id}`).send(tpl).expect((res) => expect([403, 404]).toContain(res.status));
    await jana.put(`/api/v1/checklists/templates/${created.id}`).send({ ...tpl, startNow: false, visibility: 'PUBLIC', assignees: [`G:${rez}`] }).expect(200);
    expect((await prisma.db.checklist.findUniqueOrThrow({ where: { id: created.id } })).version).toBe(2);
    await jana.delete(`/api/v1/checklists/templates/${created.id}`).expect(200);
  });
  test('Heute im Haus: Demo-Hauszahlen, Geburtstage nur freiwillig, eigene Auswahl (ADR-057)', async () => {
    const was = config.demoMode;
    config.demoMode = true;
    try {
      const ana = await as('ana.f');
      const r = (await ana.get('/api/v1/dashboard/today').expect(200)).body;
      const tile = (k: string) => r.tiles.find((t: { key: string }) => t.key === k);
      expect(tile('occupancy').value).toMatch(/^\d+ %$/);
      expect(tile('occupancy').demo).toBe(true);
      expect(tile('arrivals')).toBeTruthy();
      expect(r.weather.days).toHaveLength(5);
      expect(r.weather.hours.length).toBeGreaterThan(0);
      expect(tile('birthdays').sub).toContain('Ana');
      expect(tile('team').sub).toContain('Selin');
      expect(r.celebrate).toContain('Geburtstag');
      // Geburtstag wieder privat → taucht nicht mehr auf
      await ana.patch('/api/v1/me/settings').send({ showBirthday: false }).expect(200);
      expect(tile('birthdays').sub).toContain('Ana');
      const r2 = (await (await as('jana.m')).get('/api/v1/dashboard/today').expect(200)).body;
      expect(r2.tiles.find((t: { key: string }) => t.key === 'birthdays').sub).not.toContain('Ana');
      expect(r2.celebrate).toBeNull();
      await ana.patch('/api/v1/me/settings').send({ birthdayMonthDay: '13-40' }).expect(400);
      // eigene Auswahl
      await ana.put('/api/v1/dashboard/prefs').send({ items: [{ key: 'kpi:weather', visible: false }, { key: 'w:news', visible: true }] }).expect(200);
      expect((await ana.get('/api/v1/dashboard').expect(200)).body.prefs).toEqual([{ key: 'kpi:weather', visible: false }, { key: 'w:news', visible: true }]);
      await ana.put('/api/v1/dashboard/prefs').send({ items: [{ key: 'bad key', visible: true }] }).expect(400);
    } finally { config.demoMode = false; }
    // ohne Mews und ohne Demo keine Hauszahlen – nur Persönliches
    const off = (await (await as('jana.m')).get('/api/v1/dashboard/today').expect(200)).body;
    config.demoMode = was;
    expect(off.tiles.some((t: { key: string }) => t.key === 'occupancy')).toBe(false);
    expect(off.tiles.some((t: { key: string }) => t.key === 'mine')).toBe(true);
  });
});

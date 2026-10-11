/**
 * Phase 2 gegen echte Datenbank: News, Social, Übergaben, Kommentare, Erwähnungen,
 * Benachrichtigungen, Lesestatus (Schalter), Moderation, Chat, Bilder.
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import sharp from 'sharp';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { PrismaService } from '../src/common/prisma.service';
import { FeatureService } from '../src/common/feature.service';

jest.setTimeout(90_000);
const PW = 'Wir-Demo-2026';

describe('Phase 2 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sessions = new Map<string, ReturnType<typeof request.agent>>();

  async function as(username: string) {
    if (sessions.has(username)) return sessions.get(username)!;
    const a = request.agent(app.getHttpServer());
    await a.post('/api/v1/auth/login').send({ username, password: PW }).expect(200);
    sessions.set(username, a);
    return a;
  }
  const userId = async (username: string) => (await prisma.db.user.findUniqueOrThrow({ where: { username } })).id;
  const groupId = async (name: string) => (await prisma.db.group.findFirstOrThrow({ where: { name } })).id;
  const newsId = async (title: string) => (await prisma.db.post.findFirstOrThrow({ where: { title: { startsWith: title } } })).id;

  beforeAll(async () => {
    execSync('npx tsx prisma/seed.ts', { cwd: path.resolve(__dirname, '../../../packages/db'), stdio: 'ignore', env: process.env });
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => app?.close());

  describe('News', () => {
    test('Sichtbarkeit nach Zielgruppe: Service/Rezeption ja, Küche nein, Externe nein', async () => {
      const id = await newsId('Neue Dienstkleidung');
      await (await as('jana.m')).get(`/api/v1/news/${id}`).expect(200);
      await (await as('sven.r')).get(`/api/v1/news/${id}`).expect(404);
      const tomList = await (await as('tom.b.extern')).get('/api/v1/news').expect(200);
      expect(tomList.body.find((n: { title: string }) => n.title.startsWith('HACCP'))).toBeUndefined();
    });

    test('Leitplanken: Mitarbeitende schreiben ans eigene Team, nicht an alle und nicht „wichtig“', async () => {
      const jana = await as('jana.m');
      const rez = await groupId('Rezeption');
      const sgl = (await prisma.db.company.findFirstOrThrow({ where: { shortName: 'SGL' } })).id;
      await jana.post('/api/v1/news').send({ title: 'Test an alle', text: 'x', targets: [`C:${sgl}`] }).expect(403);
      await jana.post('/api/v1/news').send({ title: 'Test wichtig', text: 'x', targets: [`G:${rez}`], important: true }).expect(403);
      // Seit ADR-044: jede Gruppe der eigenen Gesellschaft ist erlaubt (Gruppen + Gesellschaften kombinierbar)
      await jana.post('/api/v1/news').send({ title: 'Grüße an die Küche', text: 'Danke fürs Personalessen!', targets: [`G:${rez}`, `G:${await groupId('Küche')}`] }).expect(201);
      const ok = await jana.post('/api/v1/news').send({ title: 'Kaffeemaschine Backoffice repariert', text: 'Läuft wieder.', targets: [`G:${rez}`] }).expect(201);
      expect(ok.body.recipients).toBeGreaterThan(0);
      const opts = await jana.get('/api/v1/news/options').expect(200);
      expect(opts.body.canImportant).toBe(false);
      expect(opts.body.audiences.every((a: { wide: boolean }) => !a.wide)).toBe(true);
    });

    test('Abteilungsleitung: wichtige News ans ganze Haus → Benachrichtigung', async () => {
      const sven = await as('sven.r');
      const sgl = (await prisma.db.company.findFirstOrThrow({ where: { shortName: 'SGL' } })).id;
      const res = await sven.post('/api/v1/news').send({ title: 'Wasserrohrbruch Küche – bitte Seiteneingang nutzen', text: 'Bis Mittag.', targets: [`C:${sgl}`], important: true }).expect(201);
      const n = await (await as('jana.m')).get('/api/v1/notifications').expect(200);
      expect(n.body.items.some((x: { linkPath: string }) => x.linkPath === `/news/${res.body.id}`)).toBe(true);
    });

    test('Kommentar mit Erwähnung: nur wer den Beitrag sieht, wird benachrichtigt', async () => {
      const id = await newsId('Neue Dienstkleidung');
      const jana = await as('jana.m');
      await jana.post(`/api/v1/content/${id}/comments`).send({ text: '@Tobias K. passt das bis Freitag?', mentionIds: [await userId('tobias.k'), await userId('sven.r')] }).expect(201);
      const tobias = await (await as('tobias.k')).get('/api/v1/notifications').expect(200);
      expect(tobias.body.items.some((x: { eventType: string }) => x.eventType === 'mention')).toBe(true);
      const sven = await (await as('sven.r')).get('/api/v1/notifications').expect(200);
      expect(sven.body.items.some((x: { eventType: string }) => x.eventType === 'mention')).toBe(false);
      const comments = await jana.get(`/api/v1/content/${id}/comments`).expect(200);
      expect(comments.body.length).toBeGreaterThanOrEqual(3);
    });

    test('Gefällt mir an/aus und gelesen-Markierung', async () => {
      const id = await newsId('Gruppenweit');
      const jana = await as('jana.m');
      const before = (await jana.get(`/api/v1/news/${id}`)).body;
      const r1 = await jana.post(`/api/v1/content/${id}/like`).expect(200);
      expect(r1.body.liked).toBe(!before.liked);
      await jana.post(`/api/v1/content/${id}/like`).expect(200);
      await jana.post(`/api/v1/content/${id}/seen`).expect(200);
      const unread = await jana.get('/api/v1/news?filter=unread').expect(200);
      expect(unread.body.find((n: { id: string }) => n.id === id)).toBeUndefined();
    });

    test('Lesestatus ist aus, solange der Schalter aus ist (ADR-012)', async () => {
      await prisma.db.systemSetting.update({ where: { key: 'feature.read_tracking' }, data: { value: false } });
      app.get(FeatureService).clear();
      const id = await newsId('HACCP');
      const r = await (await as('sven.r')).get(`/api/v1/content/${id}/read-status`).expect(200);
      expect(r.body.enabled).toBe(false);
      await (await as('sven.r')).post(`/api/v1/content/${id}/remind`).expect(400);
    });

    test('Mit Schalter: Lesestatus für Autor, Erinnerung nur an Ungelesene, Liste nicht für alle', async () => {
      await prisma.db.systemSetting.update({ where: { key: 'feature.read_tracking' }, data: { value: true } });
      app.get(FeatureService).clear();
      const maren = await as('maren.h');
      const svc = await groupId('Service');
      const res = await maren.post('/api/v1/news').send({ title: 'Schulung Weinbegleitung', text: 'Dienstag 15 Uhr.', targets: [`G:${svc}`] }).expect(201);
      await (await as('tobias.k')).post(`/api/v1/content/${res.body.id}/seen`).expect(200);
      const st = await maren.get(`/api/v1/content/${res.body.id}/read-status?details=1`).expect(200);
      expect(st.body).toMatchObject({ enabled: true, visible: true, read: 1 });
      expect(st.body.people.length).toBe(st.body.total);
      const other = await (await as('ana.f')).get(`/api/v1/content/${res.body.id}/read-status?details=1`).expect(200);
      expect(other.body.visible).toBe(false);
      const rem = await maren.post(`/api/v1/content/${res.body.id}/remind`).expect(200);
      expect(rem.body.reminded).toBe(st.body.total - 1);
    });
  });

  describe('Social & Moderation', () => {
    test('Biete & Suche mit Bild – Metadaten werden entfernt, Externe sehen nichts', async () => {
      const jana = await as('jana.m');
      const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#6B7A3E' } }).png().withMetadata({ exif: { IFD0: { Copyright: 'GPS-Test' } } }).toBuffer();
      const up = await jana.post('/api/v1/files').attach('file', png, { filename: 'rad.png', contentType: 'image/png' }).expect(201);
      const meta = await sharp((await jana.get(`/api/v1/files/${up.body.id}`).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); })).body).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.exif).toBeUndefined();
      const post = await jana.post('/api/v1/social').send({ title: 'Kinderwagen zu verschenken', text: 'Gut erhalten.', category: 'MARKETPLACE', visibility: 'ALL', intent: 'OFFER', price: 'zu verschenken', images: [{ fileId: up.body.id, altText: 'Kinderwagen' }] }).expect(201);
      const maren = await as('maren.h');
      const list = await maren.get('/api/v1/social').expect(200);
      const mine = list.body.find((p: { id: string }) => p.id === post.body.id);
      expect(mine.images[0].fileId).toBe(up.body.id);
      await maren.get(`/api/v1/files/${up.body.id}`).expect(200);
      await (await as('tom.b.extern')).get('/api/v1/social').expect(403);
      await (await as('tom.b.extern')).get(`/api/v1/files/${up.body.id}`).expect(404);
      await jana.post('/api/v1/social').send({ title: 'Grüße', text: 'Hallo', category: 'GREETINGS', visibility: 'ALL', price: '5 €' }).expect(400);
    });

    test('Melden → Moderationsteam blendet aus, Meldende bleiben anonym', async () => {
      const id = await newsId('Laufgruppe');
      await (await as('jana.m')).post(`/api/v1/content/${id}/report`).send({ reason: 'Testmeldung' }).expect(200);
      const lena = await as('lena.k');
      const reports = await lena.get('/api/v1/moderation/reports').expect(200);
      const r = reports.body.find((x: { title: string }) => x.title.startsWith('Laufgruppe'));
      expect(r).toBeDefined();
      expect(JSON.stringify(r)).not.toContain('Jana');
      await (await as('jana.m')).get('/api/v1/moderation/reports').expect(403);
      await lena.post(`/api/v1/moderation/reports/${r.id}/hide`).expect(200);
      await (await as('jana.m')).get(`/api/v1/social/${id}`).expect(404);
    });
  });

  describe('Übergaben', () => {
    test('Team sieht die Übergabe, Erwähnte außerhalb des Teams auch, andere nicht', async () => {
      const jana = await as('jana.m');
      const opts = await jana.get('/api/v1/handovers/options').expect(200);
      expect(opts.body.defaults).toEqual([`G:${await groupId('Rezeption')}`]);
      expect(opts.body.audiences.some((a: { key: string }) => a.key.startsWith('C:'))).toBe(false); // ganze Gesellschaft nur für Leitungen
      const res = await jana.post('/api/v1/handovers').send({
        targets: [`G:${await groupId('Rezeption')}`], shiftLabel: 'Früh', subject: 'Blumen für Zimmer 108', text: 'Bitte bis 15 Uhr.', mentionIds: [await userId('tobias.k')],
      }).expect(201);
      await (await as('selin.a')).get(`/api/v1/handovers/${res.body.id}`).expect(200);
      await (await as('tobias.k')).get(`/api/v1/handovers/${res.body.id}`).expect(200);
      await (await as('sven.r')).get(`/api/v1/handovers/${res.body.id}`).expect(404);
      // Freie Empfänger: Gruppe + Einzelperson; nicht die ganze Gesellschaft
      const mix = await jana.post('/api/v1/handovers').send({ targets: [`G:${await groupId('Küche')}`, `U:${await userId('maren.h')}`], shiftLabel: 'Früh', subject: 'Allergie Zimmer 214', text: 'Gast hat Nussallergie.' }).expect(201);
      await (await as('sven.r')).get(`/api/v1/handovers/${mix.body.id}`).expect(200);
      await (await as('maren.h')).get(`/api/v1/handovers/${mix.body.id}`).expect(200);
      await (await as('tobias.k')).get(`/api/v1/handovers/${mix.body.id}`).expect(404);
      const sgl = (await prisma.db.company.findFirstOrThrow({ where: { shortName: 'SGL' } })).id;
      await jana.post('/api/v1/handovers').send({ targets: [`C:${sgl}`], shiftLabel: 'Früh', subject: 'An alle', text: 'x' }).expect(403);
      // Stiftung: Modul ausgeschaltet (ADR-039) – seit Phase 3+4 sperrt das auch die API
      await (await as('nora.s')).get('/api/v1/handovers').expect(403);
    });
  });

  describe('Chat', () => {
    test('1:1 mit ✓✓, keine Einsicht für Admins, Gruppen nur mit Recht', async () => {
      const jana = await as('jana.m');
      const tobiasId = await userId('tobias.k');
      const c = await jana.post('/api/v1/chat/direct').send({ userId: tobiasId }).expect(201);
      const again = await jana.post('/api/v1/chat/direct').send({ userId: tobiasId }).expect(201);
      expect(again.body.id).toBe(c.body.id);
      const m = await jana.post(`/api/v1/chat/${c.body.id}/messages`).send({ text: 'Ist das Rad noch zu haben?' }).expect(201);
      const tobias = await as('tobias.k');
      expect((await tobias.get('/api/v1/chat/unread')).body.unread).toBeGreaterThanOrEqual(1);
      let conv = await jana.get(`/api/v1/chat/${c.body.id}`).expect(200);
      expect(conv.body.messages.at(-1).readByOther).toBe(false);
      await tobias.post(`/api/v1/chat/${c.body.id}/read`).send({ messageId: m.body.id }).expect(200);
      conv = await jana.get(`/api/v1/chat/${c.body.id}`).expect(200);
      expect(conv.body.messages.at(-1).readByOther).toBe(true);
      await (await as('lena.k')).get(`/api/v1/chat/${c.body.id}`).expect(404);
      await jana.post('/api/v1/chat/group').send({ title: 'Test', memberIds: [tobiasId] }).expect(403);
      await (await as('maren.h')).post('/api/v1/chat/group').send({ title: 'Service Wochenende', memberIds: [tobiasId] }).expect(201);
    });
  });

  test('Neue Kollegin bekommt laufende Haus-News nach der Freischaltung', async () => {
    const lena = await as('lena.k');
    const dewi = await userId('dewi.p');
    const res = await lena.post(`/api/v1/admin/users/${dewi}/activate`).expect(200);
    const s = request.agent(app.getHttpServer());
    await s.post('/api/v1/auth/code').send({ username: 'dewi.p', code: res.body.code }).expect(200);
    await s.post('/api/v1/auth/password').send({ newPassword: 'Erster Tag in der Küche' }).expect(200);
    const list = await s.get('/api/v1/news').expect(200);
    expect(list.body.some((n: { title: string }) => n.title.startsWith('HACCP'))).toBe(true);
    expect(list.body.some((n: { title: string }) => n.title.startsWith('Neue Dienstkleidung'))).toBe(false);
  });
});

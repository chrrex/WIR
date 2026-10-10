/**
 * Durchlauf gegen eine echte Datenbank (DATABASE_URL), mit frischem Seed.
 * Prüft Anmeldung, Einmal-Code, Pflicht-Passwortwechsel, Freischaltung, Rechte und Auftritt.
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';

jest.setTimeout(60_000);
const PW = 'Wir-Demo-2026';

describe('Auth & Verwaltung (e2e)', () => {
  let app: INestApplication;
  const agent = () => request.agent(app.getHttpServer());

  beforeAll(async () => {
    execSync('npx tsx prisma/seed.ts', { cwd: path.resolve(__dirname, '../../../packages/db'), stdio: 'ignore', env: process.env });
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await configureApp(app);
    await app.init();
  });
  afterAll(async () => app?.close());

  test('ohne Anmeldung kein Zugriff (Default Deny)', async () => {
    await request(app.getHttpServer()).get('/api/v1/me').expect(401);
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
  });

  test('falsches Passwort → allgemeine Meldung, kein Hinweis ob der Name existiert', async () => {
    const a = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username: 'jana.m', password: 'falsch-falsch' }).expect(401);
    const b = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username: 'gibt.es.nicht', password: 'falsch-falsch' }).expect(401);
    expect(a.body.message).toBe(b.body.message);
  });

  test('Mitarbeitende: Anmeldung, Auftritt SGL, keine Verwaltung', async () => {
    const s = agent();
    await s.post('/api/v1/auth/login').send({ username: 'jana.m', password: PW }).expect(200);
    const me = await s.get('/api/v1/me').expect(200);
    expect(me.body.branding.logoKey).toBe('sgl');
    expect(me.body.modules).toContain('HANDOVERS');
    await s.get('/api/v1/admin/users').expect(403);
  });

  test('Stiftung: Auftritt DKB STIFTUNG, Logo nur auf Weiß, ohne Hausmodule', async () => {
    const s = agent();
    await s.post('/api/v1/auth/login').send({ username: 'nora.s', password: PW }).expect(200);
    const me = await s.get('/api/v1/me').expect(200);
    expect(me.body.branding).toMatchObject({ logoKey: 'dkb-stiftung', logoRequiresWhite: true, surfaceColor: '#1A8FE3', primaryColor: '#0066CC' });
    expect(me.body.modules).not.toContain('HANDOVERS');
    expect(me.body.modules).not.toContain('CHECKLISTS');
    const dash = await s.get('/api/v1/dashboard').expect(200);
    expect(dash.body.isFoundation).toBe(true);
    expect(dash.body.companyOverview.length).toBeGreaterThan(0);
  });

  test('Externe: kein KI-Recht, kein Mitarbeiterverzeichnis', async () => {
    const s = agent();
    await s.post('/api/v1/auth/login').send({ username: 'tom.b.extern', password: PW }).expect(200);
    const me = await s.get('/api/v1/me').expect(200);
    expect(me.body.permissions).not.toContain('ai.use');
    expect(me.body.modules).not.toContain('TEAM');
  });

  test('Erstzugang mit Einmal-Code → Pflicht-Passwortwechsel → aktiv', async () => {
    const s = agent();
    await s.post('/api/v1/auth/code').send({ username: 'paula.s', code: '482 913' }).expect(200);
    const blocked = await s.get('/api/v1/dashboard').expect(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await s.post('/api/v1/auth/password').send({ newPassword: 'kurz' }).expect(400);
    await s.post('/api/v1/auth/password').send({ newPassword: 'Sommer im Schlosspark 7' }).expect(200);
    await s.get('/api/v1/dashboard').expect(200);
    // Code ist verbraucht
    await request(app.getHttpServer()).post('/api/v1/auth/code').send({ username: 'paula.s', code: '482913' }).expect(401);
    // neues Passwort funktioniert
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username: 'paula.s', password: 'Sommer im Schlosspark 7' }).expect(200);
  });

  test('Verwaltung: aus Gastromatic freischalten, Code wird ausgegeben und funktioniert', async () => {
    const admin = agent();
    await admin.post('/api/v1/auth/login').send({ username: 'lena.k', password: PW }).expect(200);
    const list = await admin.get('/api/v1/admin/users?status=PROVISIONED').expect(200);
    const dewi = list.body.find((u: { username: string }) => u.username === 'dewi.p');
    expect(dewi.source).toBe('GASTROMATIC');
    const res = await admin.post(`/api/v1/admin/users/${dewi.id}/activate`).expect(200);
    expect(res.body.code).toMatch(/^\d{3} \d{3}$/);
    await admin.post(`/api/v1/admin/users/${dewi.id}/activate`).expect(400);

    const neu = agent();
    await neu.post('/api/v1/auth/code').send({ username: 'dewi.p', code: res.body.code }).expect(200);
    await neu.post('/api/v1/auth/password').send({ newPassword: 'Mein erster Tag 2026' }).expect(200);
    const me = await neu.get('/api/v1/me').expect(200);
    expect(me.body.user.status).toBe('ACTIVE');

    const audit = await admin.get('/api/v1/admin/audit').expect(200);
    expect(audit.body.map((a: { action: string }) => a.action)).toEqual(expect.arrayContaining(['user.activated', 'user.one_time_code_issued']));
  });

  test('Keine Eskalation: Teamleitung darf keine Codes ausgeben', async () => {
    const s = agent();
    await s.post('/api/v1/auth/login').send({ username: 'maren.h', password: PW }).expect(200);
    const anyId = '00000000-0000-0000-0000-000000000000';
    await s.post(`/api/v1/admin/users/${anyId}/one-time-code`).expect(403);
  });

  test('Sperre nach 5 Fehlversuchen', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username: 'maren.h', password: 'falsch-' + i }).expect(401);
    }
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username: 'maren.h', password: PW }).expect(401);
    expect(r.body.message).toMatch(/Fehlversuche/);
  });

  test('Abmelden widerruft die Session', async () => {
    const s = agent();
    await s.post('/api/v1/auth/login').send({ username: 'jana.m', password: PW }).expect(200);
    await s.post('/api/v1/auth/logout').expect(200);
    await s.get('/api/v1/me').expect(401);
  });
});

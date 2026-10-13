import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { PermissionsBitField, PermissionFlagsBits } from 'discord.js';
import { SQLiteRepository } from '../src/database/sqlite.js';
import { SettingsService } from '../src/services/settings.js';
import { Tracker } from '../src/services/tracker.js';
import { StatsService } from '../src/services/stats.js';
import { ChartService } from '../src/services/charts.js';
import { createDashboard } from '../src/dashboard/server.js';
function setup(t) {
  const repo = new SQLiteRepository(':memory:');
  t.after(() => repo.close());
  const settings = new SettingsService(repo);
  let permission = true;
  const g = {
    id: '123',
    name: 'Göztepe',
    memberCount: 1,
    members: {
      fetch: async () => ({
        permissions: new PermissionsBitField(permission ? PermissionFlagsBits.ManageGuild : 0n),
      }),
      cache: new Map(),
    },
    channels: { cache: new Map() },
    voiceStates: { cache: new Map() },
  };
  g.members.cache.filter = () => ({ size: 0 });
  const ctx = {
    repo,
    settings,
    tracker: new Tracker(repo, settings),
    stats: new StatsService(repo, settings),
    charts: new ChartService(repo, settings),
    client: { guilds: { cache: new Map([['123', g]]) } },
  };
  const cfg = {
    clientId: 'x',
    clientSecret: 's',
    sessionSecret: 'x'.repeat(48),
    baseUrl: 'http://localhost:3000',
    production: false,
    trustProxy: 0,
  };
  const fetcher = async (url) => ({
    ok: true,
    json: async () =>
      url.includes('/oauth2/token')
        ? { access_token: 'fake' }
        : url.includes('/users/@me/guilds')
          ? [{ id: '123', permissions: '32' }]
          : { id: 'user', username: 'Test' },
  });
  const app = createDashboard(ctx, cfg, { fetcher });
  return { app, agent: request.agent(app), ctx, revoke: () => (permission = false) };
}
async function login(agent) {
  const login = await agent.get('/auth/login').expect(302);
  const state = new URL(login.headers.location).searchParams.get('state');
  await agent.get(`/auth/callback?state=${state}&code=code`).expect(302);
  return (await agent.get('/api/me').expect(200)).body.csrf;
}
test('dashboard unauthenticated requests fail and OAuth state is enforced', async (t) => {
  const { agent } = setup(t);
  await agent.get('/api/guilds/123/overview').expect(401);
  await agent.get('/auth/callback?state=wrong&code=x').expect(400);
  await agent
    .get('/')
    .expect(200)
    .expect('Content-Security-Policy', /script-src 'self'/);
  await agent.get('/vendor/chart.js').expect(200);
});
test('OAuth login, six views, CSRF, validation, permission revocation and logout', async (t) => {
  const { agent, revoke } = setup(t),
    csrf = await login(agent);
  const guilds = await agent.get('/api/guilds').expect(200);
  assert.equal(guilds.body[0].id, '123');
  for (const path of ['overview', 'members', 'channels', 'leaderboards', 'activity', 'settings'])
    await agent.get(`/api/guilds/123/${path}`).expect(200);
  await agent.get('/api/guilds/999/overview').expect(403);
  await agent.patch('/api/guilds/123/settings').send({ resetHour: 3 }).expect(403);
  await agent
    .patch('/api/guilds/123/settings')
    .set('X-CSRF-Token', csrf)
    .send({ resetHour: 30 })
    .expect(400);
  await agent
    .patch('/api/guilds/123/settings')
    .set('X-CSRF-Token', csrf)
    .send({ resetHour: 3 })
    .expect(200);
  revoke();
  await agent.get('/api/guilds/123/overview').expect(403);
  await agent.post('/api/logout').set('X-CSRF-Token', csrf).expect(200);
  await agent.get('/api/me').expect(401);
});
test('per-guild dashboard disable applies immediately', async (t) => {
  const { agent } = setup(t),
    csrf = await login(agent);
  await agent
    .patch('/api/guilds/123/settings')
    .set('X-CSRF-Token', csrf)
    .send({ dashboardEnabled: false })
    .expect(200);
  await agent.get('/api/guilds/123/overview').expect(403);
});
test('production dashboard refuses insecure secret and plain HTTP', (t) => {
  const { ctx } = setup(t);
  assert.throws(() => createDashboard(ctx, { clientSecret: 's', sessionSecret: 'short' }));
  assert.throws(() =>
    createDashboard(ctx, {
      clientSecret: 's',
      sessionSecret: 'x'.repeat(48),
      production: true,
      baseUrl: 'http://localhost',
    }),
  );
});

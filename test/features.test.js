import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Collection, PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { SQLiteRepository } from '../src/database/sqlite.js';
import { SettingsService } from '../src/services/settings.js';
import { Tracker } from '../src/services/tracker.js';
import { StatsService } from '../src/services/stats.js';
import { ChartService } from '../src/services/charts.js';
import { ButtonStore } from '../src/services/buttons.js';
import { commandData } from '../src/commands/index.js';
import { execute as reports } from '../src/commands/reports.js';
import { execute as admin, handleConfirmation } from '../src/commands/admin.js';
import { leaderboard } from '../src/commands/core.js';
import { canManage } from '../src/utils/permissions.js';
function setup(t) {
  const repo = new SQLiteRepository(':memory:');
  t.after(() => repo.close());
  const settings = new SettingsService(repo);
  return {
    repo,
    settings,
    tracker: new Tracker(repo, settings),
    stats: new StatsService(repo, settings),
    charts: new ChartService(repo, settings),
    buttons: new ButtonStore(),
  };
}
const row = (uid, messages, voiceMs = 0) => ({
  guildId: 'g',
  userId: uid,
  channelId: 'c',
  bucket: Math.floor(Date.now() / 60000) * 60000,
  messages,
  voiceMs,
  lastMessage: Date.now(),
  lastVoice: Date.now(),
});
test('17 slash commands serialize and have unique names; admin defaults present', () => {
  const data = commandData();
  assert.equal(data.length, 17);
  assert.equal(new Set(data.map((x) => x.name)).size, 17);
  assert.equal(data.find((x) => x.name === 'settings').default_member_permissions, '32');
  assert.equal(data.find((x) => x.name === 'top').options.length, 6);
});
test('settings validate timezone, typed values, IDs and ordered thresholds', (t) => {
  const c = setup(t);
  for (const p of [
    { timezone: 'invalid' },
    { countBots: 'true' },
    { resetHour: 24 },
    { leaderboardSize: 100 },
    { excludedRoles: ['1 OR 1=1'] },
    { activityThresholds: { veryActive: 1, active: 1, medium: 1, low: 1 } },
    { statChannels: ['1'] },
  ])
    assert.throws(() => c.settings.update('g', p));
  const v = c.settings.update('g', {
    timezone: 'America/New_York',
    excludedChannels: ['123456789012345678'],
  });
  assert.equal(v.timezone, 'America/New_York');
  assert.equal(c.repo.getSettings('g').excludedChannels.length, 1);
});
test('disk persistence and migration idempotence survive reopening', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gs-test-'));
  try {
    const path = join(dir, 'stats.db');
    let r = new SQLiteRepository(path);
    r.addBatch([row('u', 7)]);
    r.startVoice('g', 'u', 'c', 1000);
    r.close();
    r = new SQLiteRepository(path);
    r.migrate();
    assert.equal(r.aggregate('g').messages, 7);
    assert.equal(r.session('g', 'u').checkpoint_at, 1000);
    r.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('graphs are real PNGs and empty charts retain all bins', async (t) => {
  const c = setup(t);
  c.repo.addBatch([row('u', 5, 3600000)]);
  for (const period of ['7d', '30d', '24h']) {
    const d = c.charts.series('g', 'messages', period);
    assert.equal(d.labels.length, period === '7d' ? 7 : period === '30d' ? 30 : 24);
    assert.equal(
      d.values.reduce((s, n) => s + n, 0),
      5,
    );
  }
  const png = await c.charts.render(c.charts.series('g', 'voice', '7d'));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(png.length > 5000);
  const p = await c.charts.render(c.charts.members('g'));
  assert.ok(p.length > 5000);
});
test('member joins/leaves and privacy are scoped per guild and user', (t) => {
  const c = setup(t);
  c.repo.event('g', 'u', 'join', 100);
  c.repo.event('g', 'v', 'leave', 200);
  c.repo.addBatch([row('u', 10), { ...row('u', 20), guildId: 'other' }]);
  assert.deepEqual(c.repo.memberCounts('g', 0, 300), { joins: 1, leaves: 1 });
  c.tracker.deleteUser('g', 'u');
  assert.equal(c.repo.aggregate('other').messages, 20);
  assert.deepEqual(c.repo.memberCounts('g', 0, 300), { joins: 0, leaves: 1 });
  c.tracker.reset('g');
  assert.equal(c.repo.memberCounts('g', 0, 300).leaves, 0);
});
test('pagination includes 20 rows, owner bound controls and single-use confirmations', async (t) => {
  const c = setup(t);
  c.repo.addBatch(Array.from({ length: 25 }, (_, n) => row(String(n), 100 - n)));
  const i = { user: { id: 'u' }, guildId: 'g' };
  const first = await leaderboard(i, c, 'messages', 20, 0);
  const second = await leaderboard(i, c, 'messages', 20, 1);
  assert.equal(first.embeds[0].toJSON().description.split('\n').length, 20);
  assert.equal(second.embeds[0].toJSON().description.split('\n').length, 5);
  const key = c.buttons.create(i, { kind: 'server-reset' });
  assert.throws(() => c.buttons.take(`${key}:confirm`, { ...i, user: { id: 'other' } }));
  c.buttons.take(`${key}:confirm`, i, true);
  assert.throws(() => c.buttons.take(`${key}:confirm`, i));
});
test('admin reset permission is checked again on confirmation', async (t) => {
  const c = setup(t);
  c.repo.addBatch([row('u', 10)]);
  assert.equal(canManage(new PermissionsBitField(PermissionFlagsBits.ManageGuild)), true);
  assert.equal(canManage(new PermissionsBitField(0n)), false);
  await assert.rejects(
    handleConfirmation(
      { memberPermissions: new PermissionsBitField(0n) },
      { kind: 'server-reset', action: 'confirm' },
      c,
    ),
  );
  assert.equal(c.repo.aggregate('g').messages, 10);
});
test('all reporting handlers run with representative members and empty/nonempty data', async (t) => {
  const c = setup(t);
  c.repo.addBatch([row('u', 10, 60000)]);
  const user = {
      id: 'u',
      username: 'Test',
      displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png',
    },
    member = { id: 'u', joinedTimestamp: Date.now() };
  const members = new Collection([['u', member]]),
    role = { id: 'r', name: 'Yetkili', members };
  const guild = {
    id: 'g',
    name: 'Göztepe',
    members: { fetch: async () => member },
    roles: { cache: new Collection([['r', role]]) },
  };
  for (const commandName of [
    'channelstat',
    'rolestat',
    'graph',
    'memberstats',
    'activity',
    'compare',
    'rank',
    'mystats',
    'daily',
    'weekly',
    'monthly',
  ]) {
    let reply;
    const i = {
      commandName,
      guildId: 'g',
      guild,
      user,
      options: {
        getUser: () => user,
        getRole: () => role,
        getChannel: () => ({ id: 'c', name: 'sohbet', isVoiceBased: () => false }),
        getString: (key) => (key === 'type' ? 'messages' : '7d'),
      },
      editReply: async (p) => (reply = p),
    };
    await reports(i, c);
    assert.ok(reply.embeds?.length || reply.files?.length, commandName);
    for (const e of reply.embeds || []) assert.ok(e.toJSON().title);
  }
});
test('settings slash view/set works; invalid input and unauthorized writes reject', async (t) => {
  const c = setup(t);
  c.client = { guilds: { cache: new Map() } };
  const guild = { id: 'g', voiceStates: { cache: new Map() } };
  let response;
  const i = {
    commandName: 'settings',
    guild,
    guildId: 'g',
    memberPermissions: new PermissionsBitField(PermissionFlagsBits.ManageGuild),
    options: { getSubcommand: () => 'set', getString: (k) => (k === 'key' ? 'resetHour' : '4') },
    editReply: async (p) => (response = p),
  };
  await admin(i, c);
  assert.equal(c.settings.get('g').resetHour, 4);
  assert.ok(response.embeds);
  await assert.rejects(admin({ ...i, memberPermissions: new PermissionsBitField(0n) }, c));
});
test('disconnected shard never accrues unknown voice time', (t) => {
  const c = setup(t);
  c.repo.startVoice('g', 'u', 'c', 1000);
  c.tracker.suspended.add(0);
  c.tracker.voice({}, { guild: { id: 'g', shardId: 0 }, id: 'u', channel: null }, 60000);
  c.tracker.tick(
    { guilds: { cache: new Map([['g', { id: 'g', available: true, shardId: 0 }]]) } },
    60000,
  );
  assert.equal(c.repo.aggregate('g').voiceMs, 0);
});
test('DST reset uses wall-clock hour and chart buckets stay aligned', async (t) => {
  const c = setup(t);
  c.settings.update('g', { timezone: 'America/New_York', resetHour: 4 });
  const { ranges } = await import('../src/utils/time.js');
  const now = Date.UTC(2026, 2, 8, 12);
  assert.equal(ranges(c.settings.get('g'), now).daily, Date.UTC(2026, 2, 8, 8));
  c.repo.addBatch([{ ...row('u', 3), bucket: Date.UTC(2026, 2, 8, 8, 1) }]);
  const d = c.charts.series('g', 'messages', '7d', now);
  assert.equal(d.values[6], 3);
  assert.equal(
    d.values.reduce((a, b) => a + b, 0),
    3,
  );
});
test('batched voice checkpoints accumulate once for multiple members', (t) => {
  const c = setup(t);
  const guild = { id: 'g', available: true, shardId: 0, voiceStates: { cache: new Map() } };
  for (const uid of ['u', 'v']) {
    const member = { guild, user: { bot: false }, roles: { cache: { some: () => false } } };
    guild.voiceStates.cache.set(uid, { id: uid, member, channel: { id: 'c' }, channelId: 'c' });
    c.repo.startVoice('g', uid, 'c', 1000);
  }
  const client = { guilds: { cache: new Map([['g', guild]]) } };
  c.tracker.tick(client, 61000);
  c.tracker.tick(client, 61000);
  assert.equal(c.repo.aggregate('g').voiceMs, 120000);
  assert.equal(
    c.repo.sessions().every((s) => s.checkpoint_at === 61000),
    true,
  );
});
test('gateway handlers bind to a real discord.js Client without logging in', async (t) => {
  const { Client, GatewayIntentBits } = await import('discord.js');
  const { registerEvents } = await import('../src/events/index.js');
  const c = setup(t);
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  t.after(() => client.destroy());
  assert.doesNotThrow(() => registerEvents(client, c));
  assert.ok(client.listenerCount('messageCreate'));
  assert.ok(client.listenerCount('voiceStateUpdate'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { SQLiteRepository } from '../src/database/sqlite.js';
import { SettingsService } from '../src/services/settings.js';
import { Tracker } from '../src/services/tracker.js';
import { StatsService } from '../src/services/stats.js';
import { ranges } from '../src/utils/time.js';
function fixture(t) {
  const repo = new SQLiteRepository(':memory:');
  t.after(() => repo.close());
  const settings = new SettingsService(repo);
  const tracker = new Tracker(repo, settings);
  const stats = new StatsService(repo, settings);
  const member = {
    guild: { id: 'g' },
    user: { bot: false },
    roles: { cache: { some: () => false } },
  };
  const channel = { id: 'c' };
  return { repo, settings, tracker, stats, member, channel };
}
test('MVP: batched messages, bot/webhook filtering, duplicate gateway event, per-channel and ranks', (t) => {
  const f = fixture(t),
    at = Date.now();
  const message = {
    id: 'm1',
    guild: { id: 'g' },
    member: f.member,
    channel: f.channel,
    channelId: 'c',
    author: { id: 'u' },
    createdTimestamp: at,
  };
  f.tracker.message(message);
  f.tracker.message(message);
  f.tracker.message({ ...message, id: 'web', webhookId: 'w' });
  f.tracker.message({ ...message, id: 'bot', member: { ...f.member, user: { bot: true } } });
  assert.equal(f.repo.aggregate('g').messages, 0);
  f.tracker.flush();
  f.tracker.flush();
  assert.equal(f.stats.user('g', 'u').total.messages, 1);
  assert.equal(f.stats.user('g', 'u').messageRank, 1);
  assert.equal(f.repo.top('g')[0].id, 'u');
  assert.equal(f.repo.top('g', 'messages', { group: 'channel' })[0].id, 'c');
});
test('MVP: voice channel move, checkpoints, midnight split, no double counting', (t) => {
  const f = fixture(t),
    start = Date.UTC(2026, 0, 1, 20, 59, 30);
  const state = {
    guild: { id: 'g' },
    id: 'u',
    member: f.member,
    channel: f.channel,
    channelId: 'c',
  };
  f.tracker.voice({}, state, start);
  f.tracker.checkpoint(f.repo.session('g', 'u'), start + 30000);
  f.tracker.voice(state, { ...state, channel: { id: 'c2' }, channelId: 'c2' }, start + 60000);
  f.tracker.voice(state, { ...state, channel: null, channelId: null }, start + 90000);
  assert.equal(f.repo.aggregate('g').voiceMs, 90000);
  assert.equal(f.repo.aggregate('g', { channelId: 'c' }).voiceMs, 60000);
  assert.equal(f.repo.aggregate('g', { since: start + 30000 }).voiceMs, 60000);
  assert.equal(f.repo.sessions().length, 0);
});
test('MVP: restart keeps committed time and discards unobservable downtime', (t) => {
  const f = fixture(t);
  f.repo.startVoice('g', 'u', 'c', 100000);
  f.tracker.checkpoint(f.repo.session('g', 'u'), 160000);
  const state = { id: 'u', member: f.member, channel: f.channel, channelId: 'c' };
  f.tracker.reconcile({ id: 'g', voiceStates: { cache: new Map([['u', state]]) } }, 500000);
  assert.equal(f.repo.aggregate('g').voiceMs, 60000);
  assert.equal(f.repo.session('g', 'u').checkpoint_at, 500000);
});
test('MVP: timezone/reset boundaries and privacy remove pending writes', (t) => {
  const f = fixture(t);
  const s = f.settings.get('g');
  s.resetHour = 4;
  const now = Date.UTC(2026, 0, 2, 0, 0);
  assert.equal(ranges(s, now).daily, Date.UTC(2026, 0, 1, 1, 0));
  f.tracker.message({
    id: 'p',
    guild: { id: 'g' },
    member: f.member,
    channel: f.channel,
    channelId: 'c',
    author: { id: 'u' },
    createdTimestamp: now,
  });
  f.tracker.deleteUser('g', 'u');
  f.tracker.flush();
  assert.equal(f.repo.aggregate('g').messages, 0);
});
test('MVP: transactional batch rollback retains queue on failure', (t) => {
  const f = fixture(t);
  assert.throws(() =>
    f.repo.addBatch([
      { guildId: 'g', userId: 'u', channelId: 'c', bucket: 0, messages: 1 },
      { guildId: 'g', userId: null, channelId: 'c', bucket: 0, messages: 1 },
    ]),
  );
  assert.equal(f.repo.aggregate('g').messages, 0);
});
test('MVP: /stat /top /serverstat handlers produce valid Discord payloads', async (t) => {
  const f = fixture(t);
  const { execute } = await import('../src/commands/core.js');
  const { ButtonStore } = await import('../src/services/buttons.js');
  const user = {
    id: 'u',
    username: 'Test',
    displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png',
  };
  const guild = {
    id: 'g',
    name: 'Göztepe',
    memberCount: 1,
    members: {
      fetch: async () => ({ joinedTimestamp: Date.now() }),
      cache: { filter: () => ({ size: 0 }) },
    },
  };
  for (const commandName of ['stat', 'top', 'serverstat']) {
    let result;
    await execute(
      {
        commandName,
        guild,
        guildId: 'g',
        user,
        options: { getUser: () => null, getInteger: () => null, getSubcommand: () => 'messages' },
        editReply: async (p) => {
          result = p;
        },
      },
      { ...f, buttons: new ButtonStore() },
    );
    assert.ok(result.embeds[0].toJSON().title);
    assert.ok(JSON.stringify(result).length < 6000);
  }
});

import { minute, splitMinutes } from '../utils/time.js';
export class Tracker {
  constructor(repo, settings) {
    this.repo = repo;
    this.settings = settings;
    this.pending = new Map();
    this.seen = new Set();
    this.suspended = new Set();
  }
  message(message) {
    if (
      !message.guild ||
      message.webhookId ||
      !this.settings.eligible(message.member, message.channel) ||
      this.seen.has(message.id)
    )
      return;
    this.seen.add(message.id);
    if (this.seen.size > 50000) this.seen.delete(this.seen.values().next().value);
    const at = message.createdTimestamp;
    const row = {
      guildId: message.guild.id,
      userId: message.author.id,
      channelId: message.channelId,
      bucket: minute(at),
      messages: 1,
      lastMessage: at,
    };
    const key = [row.guildId, row.userId, row.channelId, row.bucket].join(':');
    const old = this.pending.get(key);
    if (old) {
      old.messages++;
      old.lastMessage = Math.max(old.lastMessage, at);
    } else this.pending.set(key, row);
    if (this.pending.size >= 10000) this.flush();
  }
  flush() {
    if (!this.pending.size) return;
    this.repo.addBatch([...this.pending.values()]);
    this.pending.clear();
  }
  plan(session, now, close = false) {
    const end = Math.max(now, session.checkpoint_at);
    const rows = [...splitMinutes(session.checkpoint_at, end)].map(({ bucket, duration }) => ({
      guildId: session.guild_id,
      userId: session.user_id,
      channelId: session.channel_id,
      bucket,
      voiceMs: duration,
      lastVoice: end,
    }));
    return { gid: session.guild_id, uid: session.user_id, at: end, rows, close };
  }
  checkpoint(session, now, close = false) {
    this.repo.checkpointVoices([this.plan(session, now, close)]);
  }
  voice(oldState, newState, now = Date.now()) {
    if (this.suspended.has(newState.guild.shardId) || newState.guild.available === false) return;
    const gid = newState.guild.id,
      uid = newState.id;
    const current = this.repo.session(gid, uid);
    const valid = newState.channel && this.settings.eligible(newState.member, newState.channel);
    if (current && current.channel_id === newState.channelId && valid) return;
    if (current) this.checkpoint(current, now, true);
    if (valid) this.repo.startVoice(gid, uid, newState.channelId, now);
  }
  tick(client, now = Date.now()) {
    this.flush();
    const plans = [];
    for (const s of this.repo.sessions()) {
      const guild = client.guilds.cache.get(s.guild_id);
      if (!guild?.available || this.suspended.has(guild.shardId)) continue;
      const state = guild.voiceStates.cache.get(s.user_id);
      if (state?.channelId === s.channel_id && this.settings.eligible(state.member, state.channel))
        plans.push(this.plan(s, now));
      else plans.push(this.plan(s, s.checkpoint_at, true)); // Never invent time after a lost state.
    }
    this.repo.checkpointVoices(plans);
  }
  reconcile(guild, now = Date.now()) {
    // Offline intervals cannot be proven; retain committed time, discard unknown gap.
    for (const s of this.repo.sessions(guild.id))
      this.repo.checkpointVoice(guild.id, s.user_id, now, [], true);
    for (const state of guild.voiceStates.cache.values())
      if (state.channel && this.settings.eligible(state.member, state.channel))
        this.repo.startVoice(guild.id, state.id, state.channelId, now);
  }
  deleteUser(gid, uid) {
    for (const [key, r] of this.pending)
      if (r.guildId === gid && r.userId === uid) this.pending.delete(key);
    this.repo.deleteUser(gid, uid);
  }
  reset(gid) {
    for (const [key, r] of this.pending) if (r.guildId === gid) this.pending.delete(key);
    this.repo.resetGuild(gid);
  }
}

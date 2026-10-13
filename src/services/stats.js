import { ranges } from '../utils/time.js';
export class StatsService {
  constructor(repo, settings) {
    this.repo = repo;
    this.settings = settings;
  }
  summary(gid, filter = {}, now = Date.now()) {
    const r = ranges(this.settings.get(gid), now);
    return {
      total: this.repo.aggregate(gid, filter),
      daily: this.repo.aggregate(gid, { ...filter, since: r.daily }),
      weekly: this.repo.aggregate(gid, { ...filter, since: r.weekly }),
      monthly: this.repo.aggregate(gid, { ...filter, since: r.monthly }),
    };
  }
  user(gid, uid) {
    return {
      ...this.summary(gid, { userId: uid }),
      messageRank: this.repo.rank(gid, uid, 'messages'),
      voiceRank: this.repo.rank(gid, uid, 'voice'),
      textChannel: this.repo.top(gid, 'messages', { userId: uid, group: 'channel', limit: 1 })[0],
      voiceChannel: this.repo.top(gid, 'voice', { userId: uid, group: 'channel', limit: 1 })[0],
    };
  }
  activity(gid, uid) {
    const s = this.summary(gid, { userId: uid });
    const recent = this.repo.aggregate(gid, {
      userId: uid,
      since: ranges(this.settings.get(gid)).rolling7,
    });
    const score = recent.messages + recent.voiceMs / 60000 / 5;
    const t = this.settings.get(gid).activityThresholds;
    return {
      ...s,
      recent,
      score,
      status:
        score >= t.veryActive
          ? 'Çok Aktif'
          : score >= t.active
            ? 'Aktif'
            : score >= t.medium
              ? 'Orta'
              : score >= t.low
                ? 'Düşük'
                : 'Pasif',
    };
  }
  server(guild) {
    const gid = guild.id,
      r = ranges(this.settings.get(gid));
    const current = this.repo.aggregate(gid, { since: r.rolling7 });
    const prior = this.repo.aggregate(gid, { since: r.rolling7 - 7 * 86400000, until: r.rolling7 });
    return {
      ...this.summary(gid),
      members: guild.memberCount,
      bots: guild.members.cache.filter((m) => m.user.bot).size,
      active: this.repo.active(gid, r.rolling7),
      last24: this.repo.aggregate(gid, { since: r.rolling24 }),
      last7: current,
      textChannel: this.repo.top(gid, 'messages', { group: 'channel', limit: 1 })[0],
      voiceChannel: this.repo.top(gid, 'voice', { group: 'channel', limit: 1 })[0],
      user: this.repo.top(gid, 'messages', { limit: 1 })[0],
      change: prior.messages
        ? Math.round(((current.messages - prior.messages) / prior.messages) * 100)
        : null,
    };
  }
}

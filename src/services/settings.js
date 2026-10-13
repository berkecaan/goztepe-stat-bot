import { IANAZone } from 'luxon';
export class SettingsService {
  constructor(repo) {
    this.repo = repo;
    this.cache = new Map();
  }
  get(gid) {
    if (!this.cache.has(gid)) this.cache.set(gid, this.repo.getSettings(gid));
    return this.cache.get(gid);
  }
  update(gid, patch) {
    const allowed = [
      'countBots',
      'excludedChannels',
      'excludedRoles',
      'timezone',
      'leaderboardSize',
      'dashboardEnabled',
      'resetHour',
      'activityThresholds',
    ];
    if (!patch || typeof patch !== 'object' || Array.isArray(patch))
      throw new Error('Ayar nesnesi gerekli.');
    for (const key of Object.keys(patch))
      if (!allowed.includes(key)) throw new Error(`Bilinmeyen ayar: ${key}`);
    const next = { ...this.get(gid), ...patch };
    if (!IANAZone.isValidZone(next.timezone))
      throw new Error('Geçerli IANA timezone gerekli. Örnek: Europe/Istanbul');
    for (const key of ['countBots', 'dashboardEnabled'])
      if (typeof next[key] !== 'boolean') throw new Error(`${key} true/false olmalı.`);
    if (![10, 20].includes(next.leaderboardSize)) throw new Error('Leaderboard 10 veya 20 olmalı.');
    if (!Number.isInteger(next.resetHour) || next.resetHour < 0 || next.resetHour > 23)
      throw new Error('Reset saati 0–23 olmalı.');
    for (const key of ['excludedChannels', 'excludedRoles'])
      if (
        !Array.isArray(next[key]) ||
        next[key].length > 100 ||
        next[key].some((v) => typeof v !== 'string' || !/^\d{17,20}$/.test(v))
      )
        throw new Error(`${key}: en fazla 100 geçerli ID.`);
    const t = next.activityThresholds;
    if (
      !t ||
      ['veryActive', 'active', 'medium', 'low'].some((k) => !Number.isFinite(t[k]) || t[k] < 0) ||
      !(t.veryActive > t.active && t.active > t.medium && t.medium > t.low)
    )
      throw new Error('Aktivite eşikleri azalan pozitif sayılar olmalı.');
    this.repo.setSettings(gid, next);
    this.cache.set(gid, next);
    return next;
  }
  statChannels(gid, ids) {
    const next = { ...this.get(gid), statChannels: ids };
    this.repo.setSettings(gid, next);
    this.cache.set(gid, next);
  }
  eligible(member, channel) {
    if (!member || !channel) return false;
    const s = this.get(member.guild.id);
    return (
      (!member.user.bot || s.countBots) &&
      !s.excludedChannels.includes(channel.id) &&
      !s.excludedChannels.includes(channel.parentId) &&
      !member.roles.cache.some((r) => s.excludedRoles.includes(r.id))
    );
  }
}

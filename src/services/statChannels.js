import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { number, ranges } from '../utils/time.js';
import { log } from '../utils/logger.js';
export class StatChannelService {
  constructor(ctx) {
    this.ctx = ctx;
    this.busy = new Set();
  }
  async setup(guild) {
    if (this.busy.has(guild.id)) throw new Error('Kanal işlemi devam ediyor.');
    this.busy.add(guild.id);
    try {
      const s = this.ctx.settings.get(guild.id);
      if (s.statChannels.length) throw new Error('Stat kanalları zaten kurulmuş.');
      const ids = [];
      try {
        for (const name of ['Üyeler', 'Aktif', 'Bugün Mesaj']) {
          const c = await guild.channels.create({
            name: `${name}: 0`,
            type: ChannelType.GuildVoice,
            permissionOverwrites: [{ id: guild.id, deny: [PermissionFlagsBits.Connect] }],
            reason: 'Göztepe Stat Bot sayaç kurulumu',
          });
          ids.push(c.id);
          this.ctx.settings.statChannels(guild.id, [...ids]);
        }
      } catch (e) {
        log.error('Stat kanalı kurulumu yarım kaldı; remove ile temizlenebilir', e);
        throw e;
      }
      await this.update(guild);
      return ids;
    } finally {
      this.busy.delete(guild.id);
    }
  }
  async remove(guild) {
    if (this.busy.has(guild.id)) throw new Error('Kanal işlemi devam ediyor.');
    this.busy.add(guild.id);
    try {
      const failed = [];
      for (const id of this.ctx.settings.get(guild.id).statChannels) {
        try {
          const c = await guild.channels.fetch(id);
          if (c) await c.delete('Göztepe Stat Bot sayaç kaldırma');
        } catch (e) {
          if (e.code !== 10003) failed.push(id);
        }
      }
      this.ctx.settings.statChannels(guild.id, failed);
      if (failed.length)
        throw new Error('Bazı kanallar silinemedi; botun Kanal Yönet yetkisini kontrol edin.');
    } finally {
      this.busy.delete(guild.id);
    }
  }
  async update(guild) {
    const { settings, repo } = this.ctx,
      s = settings.get(guild.id),
      r = ranges(s);
    const names = [
      `Üyeler: ${number(guild.memberCount)}`,
      `Aktif: ${number(repo.active(guild.id, r.rolling7))}`,
      `Bugün Mesaj: ${number(repo.aggregate(guild.id, { since: r.daily }).messages)}`,
    ];
    for (const [index, id] of s.statChannels.entries()) {
      const c = guild.channels.cache.get(id);
      if (c && names[index] && c.name !== names[index])
        await c.setName(names[index], 'Göztepe Stat Bot periyodik güncelleme');
    }
  }
}

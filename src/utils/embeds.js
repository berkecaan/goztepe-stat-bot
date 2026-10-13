import { EmbedBuilder } from 'discord.js';
import { duration, number, timestamp } from './time.js';
export const embed = (title) =>
  new EmbedBuilder()
    .setTitle(title)
    .setColor(0xe9b949)
    .setFooter({ text: 'Göztepe Stat Bot • Günlük / son 7 gün / son 30 gün' })
    .setTimestamp();
export const channel = (r) => (r ? `<#${r.id}>` : 'Henüz yok');
export function summaryFields(s) {
  return [
    {
      name: 'Mesaj',
      value: `Toplam **${number(s.total.messages)}**\nBugün ${number(s.daily.messages)}\n7 gün ${number(s.weekly.messages)}\n30 gün ${number(s.monthly.messages)}`,
      inline: true,
    },
    {
      name: 'Ses',
      value: `Toplam **${duration(s.total.voiceMs)}**\nBugün ${duration(s.daily.voiceMs)}\n7 gün ${duration(s.weekly.voiceMs)}\n30 gün ${duration(s.monthly.voiceMs)}`,
      inline: true,
    },
  ];
}
export function userEmbed(user, member, s) {
  return embed(`${user.username} • Aktivite kartı`)
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      ...summaryFields(s),
      {
        name: 'Sıralama',
        value: `Mesaj: **${s.messageRank || '—'}**\nSes: **${s.voiceRank || '—'}**`,
        inline: true,
      },
      {
        name: 'En aktif kanallar',
        value: `Yazı ${channel(s.textChannel)}\nSes ${channel(s.voiceChannel)}`,
        inline: true,
      },
      {
        name: 'Son aktivite',
        value: `Mesaj ${timestamp(s.total.lastMessage)}\nSes ${timestamp(s.total.lastVoice)}`,
        inline: true,
      },
      { name: 'Sunucuya katılım', value: timestamp(member?.joinedTimestamp), inline: true },
    );
}
export function serverEmbed(guild, s) {
  return embed(`${guild.name} • Sunucu özeti`).addFields(
    {
      name: 'Üyeler',
      value: `Toplam **${number(s.members)}**\nBot ${number(s.bots)}\nAktif (7 gün) ${number(s.active)}`,
      inline: true,
    },
    ...summaryFields(s),
    {
      name: 'Son 24 saat',
      value: `${number(s.last24.messages)} mesaj\n${duration(s.last24.voiceMs)} ses`,
      inline: true,
    },
    {
      name: 'Son 7 gün değişimi',
      value: `${number(s.last7.messages)} mesaj\n${s.change === null ? 'Önceki dönemde veri yok' : `${s.change > 0 ? '+' : ''}${s.change}% mesaj değişimi`}`,
      inline: true,
    },
    {
      name: 'Öne çıkanlar',
      value: `Yazı ${channel(s.textChannel)}\nSes ${channel(s.voiceChannel)}\nÜye ${s.user ? `<@${s.user.id}>` : 'Henüz yok'}`,
      inline: true,
    },
  );
}

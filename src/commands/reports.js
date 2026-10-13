import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import { embed, summaryFields, userEmbed } from '../utils/embeds.js';
import { duration, number, ranges, timestamp } from '../utils/time.js';
const cmd = (name, desc) => new SlashCommandBuilder().setName(name).setDescription(desc);
const userOption = (o) => o.setName('user').setDescription('Üye');
export const data = [
  cmd('channelstat', 'Kanal istatistikleri').addChannelOption((o) =>
    o.setName('channel').setDescription('Kanal').setRequired(true),
  ),
  cmd('rolestat', 'Rolün mevcut üyelerinin istatistikleri').addRoleOption((o) =>
    o.setName('role').setDescription('Rol').setRequired(true),
  ),
  cmd('graph', 'Aktivite grafiği')
    .addStringOption((o) =>
      o
        .setName('type')
        .setDescription('Metrik')
        .setRequired(true)
        .addChoices({ name: 'Mesajlar', value: 'messages' }, { name: 'Ses', value: 'voice' }),
    )
    .addStringOption((o) =>
      o
        .setName('period')
        .setDescription('Dönem')
        .setRequired(true)
        .addChoices(
          { name: '7 gün', value: '7d' },
          { name: '30 gün', value: '30d' },
          { name: '24 saat', value: '24h' },
        ),
    ),
  cmd('memberstats', 'Katılım ve ayrılma raporu'),
  cmd('activity', 'Son aktivite ve durum').addUserOption(userOption),
  cmd('compare', 'İki üyeyi karşılaştır')
    .addUserOption((o) => o.setName('user1').setDescription('İlk üye').setRequired(true))
    .addUserOption((o) => o.setName('user2').setDescription('İkinci üye').setRequired(true)),
  cmd('rank', 'Sunucudaki mesaj ve ses sıranız'),
  cmd('mystats', 'Kendi aktivite kartınız'),
  cmd('daily', 'Bugünün sunucu raporu'),
  cmd('weekly', 'Son 7 günlük sunucu raporu'),
  cmd('monthly', 'Son 30 günlük sunucu raporu'),
];
function list(rows, voice = false) {
  return (
    rows
      .slice(0, 10)
      .map((r, n) => `${n + 1}. <@${r.id}> • ${voice ? duration(r.value) : number(r.value)}`)
      .join('\n') || 'Henüz veri yok.'
  );
}
export async function execute(i, ctx) {
  const gid = i.guildId,
    name = i.commandName;
  let result;
  if (name === 'mystats') {
    const member = await i.guild.members.fetch(i.user.id);
    result = userEmbed(i.user, member, ctx.stats.user(gid, i.user.id));
  } else if (name === 'rank') {
    const s = ctx.stats.user(gid, i.user.id);
    result = embed('Sıralamanız').setDescription(
      `Mesaj **${s.messageRank || '—'}**\nSes **${s.voiceRank || '—'}**`,
    );
  } else if (name === 'channelstat') {
    const c = i.options.getChannel('channel'),
      voice = c.isVoiceBased(),
      s = ctx.stats.summary(gid, { channelId: c.id });
    const format = (v) => (voice ? duration(v.voiceMs) : number(v.messages));
    result = embed(`${c.name} • ${voice ? 'Ses' : 'Mesaj'} istatistiği`)
      .setDescription(
        `Toplam **${format(s.total)}**\nBugün **${format(s.daily)}**\n7 gün **${format(s.weekly)}**\n30 gün **${format(s.monthly)}**`,
      )
      .addFields({
        name: 'En aktif üyeler',
        value: list(
          ctx.repo.top(gid, voice ? 'voice' : 'messages', { channelId: c.id, limit: 10 }),
          voice,
        ),
      });
  } else if (name === 'rolestat') {
    await i.guild.members.fetch();
    const role = i.guild.roles.cache.get(i.options.getRole('role').id);
    const ids = new Set(role.members.keys());
    const rows = ctx.repo.userTotals(gid).filter((r) => ids.has(r.id));
    const messages = rows.reduce((s, r) => s + r.messages, 0),
      voice = rows.reduce((s, r) => s + r.voiceMs, 0),
      count = ids.size;
    result = embed(`${role.name} • Rol raporu`).addFields(
      { name: 'Üyeler', value: number(count), inline: true },
      {
        name: 'Mesaj',
        value: `${number(messages)}\nKişi başı ${number(count ? Math.round(messages / count) : 0)}`,
        inline: true,
      },
      {
        name: 'Ses',
        value: `${duration(voice)}\nKişi başı ${duration(count ? voice / count : 0)}`,
        inline: true,
      },
      {
        name: 'En aktif • Mesaj',
        value: list(
          [...rows]
            .sort((a, b) => b.messages - a.messages)
            .map((r) => ({ id: r.id, value: r.messages })),
        ),
      },
      {
        name: 'En aktif • Ses',
        value: list(
          [...rows]
            .sort((a, b) => b.voiceMs - a.voiceMs)
            .map((r) => ({ id: r.id, value: r.voiceMs })),
          true,
        ),
      },
    );
  } else if (name === 'graph') {
    const data = ctx.charts.series(gid, i.options.getString('type'), i.options.getString('period'));
    return i.editReply({
      files: [
        new AttachmentBuilder(await ctx.charts.render(data), { name: 'goztepe-aktivite.png' }),
      ],
    });
  } else if (name === 'memberstats') {
    const r = ranges(ctx.settings.get(gid)),
      today = ctx.repo.memberCounts(gid, r.daily),
      week = ctx.repo.memberCounts(gid, r.weekly),
      month = ctx.repo.memberCounts(gid, r.monthly);
    result = embed('Üye hareketleri')
      .setDescription(
        `Bugün katılan **${number(today.joins)}**\nBugün ayrılan **${number(today.leaves)}**\n7 gün net **${number(week.joins - week.leaves)}**\n30 gün net **${number(month.joins - month.leaves)}**`,
      )
      .setImage('attachment://uyeler.png');
    return i.editReply({
      embeds: [result],
      files: [
        new AttachmentBuilder(await ctx.charts.render(ctx.charts.members(gid)), {
          name: 'uyeler.png',
        }),
      ],
    });
  } else if (name === 'activity') {
    const user = i.options.getUser('user') || i.user,
      s = ctx.stats.activity(gid, user.id);
    result = embed(`${user.username} • ${s.status}`)
      .addFields(
        {
          name: 'Son aktivite',
          value: `Mesaj ${timestamp(s.total.lastMessage)}\nSes ${timestamp(s.total.lastVoice)}`,
        },
        {
          name: 'Son 7 gün',
          value: `${number(s.recent.messages)} mesaj\n${duration(s.recent.voiceMs)} ses`,
        },
      )
      .setFooter({ text: `Puan: ${Math.floor(s.score)} • 1 mesaj = 1 puan, 5 dk ses = 1 puan` });
  } else if (name === 'compare') {
    result = embed('Üye karşılaştırması');
    for (const user of [i.options.getUser('user1'), i.options.getUser('user2')]) {
      const s = ctx.stats.user(gid, user.id);
      result.addFields({
        name: user.username,
        value: `Toplam: ${number(s.total.messages)} mesaj / ${duration(s.total.voiceMs)}\n7 gün: ${number(s.weekly.messages)} / ${duration(s.weekly.voiceMs)}\nMesaj sırası ${s.messageRank || '—'} • Ses sırası ${s.voiceRank || '—'}`,
        inline: true,
      });
    }
  } else {
    const s = ctx.stats.summary(gid),
      v = s[name];
    result = embed(
      `${i.guild.name} • ${name === 'daily' ? 'Bugün' : name === 'weekly' ? 'Son 7 gün' : 'Son 30 gün'}`,
    )
      .setDescription(`**${number(v.messages)}** mesaj\n**${duration(v.voiceMs)}** ses`)
      .addFields(...summaryFields(s));
  }
  return i.editReply({ embeds: [result] });
}

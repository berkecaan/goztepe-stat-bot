import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { userEmbed, serverEmbed, embed } from '../utils/embeds.js';
import { duration, number, ranges } from '../utils/time.js';
export const data = [
  new SlashCommandBuilder()
    .setName('stat')
    .setDescription('Üyenin aktivite kartı')
    .addUserOption((o) => o.setName('user').setDescription('Üye')),
  new SlashCommandBuilder().setName('serverstat').setDescription('Sunucu istatistikleri'),
  new SlashCommandBuilder()
    .setName('top')
    .setDescription('Aktivite sıralaması')
    .addSubcommand((s) => topSub(s, 'messages'))
    .addSubcommand((s) => topSub(s, 'voice'))
    .addSubcommand((s) => topSub(s, 'weekly-messages'))
    .addSubcommand((s) => topSub(s, 'weekly-voice'))
    .addSubcommand((s) => topSub(s, 'monthly-messages'))
    .addSubcommand((s) => topSub(s, 'monthly-voice')),
];
function topSub(s, name) {
  return s
    .setName(name)
    .setDescription(`${name} sıralaması`)
    .addIntegerOption((o) =>
      o
        .setName('size')
        .setDescription('Sayfa boyutu')
        .addChoices({ name: '10', value: 10 }, { name: '20', value: 20 }),
    );
}
export async function leaderboard(i, ctx, type, size, page = 0) {
  const gid = i.guildId,
    metric = type.endsWith('voice') ? 'voice' : 'messages',
    r = ranges(ctx.settings.get(gid));
  const since = type.startsWith('weekly')
    ? r.weekly
    : type.startsWith('monthly')
      ? r.monthly
      : undefined;
  const rows = ctx.repo.top(gid, metric, { since, limit: size + 1, offset: page * size });
  const text =
    rows
      .slice(0, size)
      .map(
        (row, index) =>
          `**${page * size + index + 1}.** <@${row.id}> — ${metric === 'voice' ? duration(row.value) : `${number(row.value)} mesaj`}`,
      )
      .join('\n') || 'Bu dönemde henüz aktivite yok.';
  const key = ctx.buttons.create(i, { kind: 'top', type, size, page });
  return {
    embeds: [
      embed(`Sıralama • ${type}`)
        .setDescription(text)
        .setFooter({ text: `Göztepe Stat Bot • Sayfa ${page + 1} • Butonlar 5 dakika geçerli` }),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${key}:prev`)
          .setLabel('Önceki')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId(`${key}:next`)
          .setLabel('Sonraki')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(rows.length <= size),
      ),
    ],
  };
}
export async function execute(i, ctx) {
  if (i.commandName === 'stat') {
    const user = i.options.getUser('user') || i.user;
    const member = await i.guild.members.fetch(user.id).catch(() => null);
    return i.editReply({ embeds: [userEmbed(user, member, ctx.stats.user(i.guildId, user.id))] });
  }
  if (i.commandName === 'serverstat')
    return i.editReply({ embeds: [serverEmbed(i.guild, ctx.stats.server(i.guild))] });
  return i.editReply(
    await leaderboard(
      i,
      ctx,
      i.options.getSubcommand(),
      i.options.getInteger('size') || ctx.settings.get(i.guildId).leaderboardSize,
    ),
  );
}

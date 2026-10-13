import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { requireManager } from '../utils/permissions.js';
import { embed } from '../utils/embeds.js';
const cmd = (name, description) =>
  new SlashCommandBuilder().setName(name).setDescription(description);
export const data = [
  cmd('settings', 'Sunucu istatistik ayarları')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('view').setDescription('Mevcut ayarlar'))
    .addSubcommand((s) =>
      s
        .setName('set')
        .setDescription('Ayar değiştir')
        .addStringOption((o) =>
          o
            .setName('key')
            .setDescription('Ayar')
            .setRequired(true)
            .addChoices(
              ...[
                'countBots',
                'excludedChannels',
                'excludedRoles',
                'timezone',
                'leaderboardSize',
                'dashboardEnabled',
                'resetHour',
                'activityThresholds',
              ].map((v) => ({ name: v, value: v })),
            ),
        )
        .addStringOption((o) =>
          o
            .setName('value')
            .setDescription('Değer: true/false, sayı, timezone veya JSON dizi/nesne')
            .setRequired(true),
        ),
    ),
  cmd('stat-channel', 'Otomatik sayaç kanalları')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s.setName('setup').setDescription('Üye, aktif ve mesaj sayaçlarını oluştur'),
    )
    .addSubcommand((s) => s.setName('remove').setDescription('Botun sayaç kanallarını kaldır')),
  cmd('privacy', 'İstatistik verilerini sil')
    .addSubcommand((s) =>
      s.setName('delete-my-data').setDescription('Bu sunucudaki kendi istatistiklerini sil'),
    )
    .addSubcommand((s) =>
      s.setName('server-reset').setDescription('Yönetici: sunucunun tüm istatistiklerini sıfırla'),
    ),
];
function confirm(i, ctx, kind, text) {
  const id = ctx.buttons.create(i, { kind });
  return i.editReply({
    content: text,
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${id}:confirm`)
          .setLabel('Onayla')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`${id}:cancel`)
          .setLabel('Vazgeç')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  });
}
export async function execute(i, ctx) {
  const sub = i.options.getSubcommand();
  if (i.commandName === 'privacy') {
    if (sub === 'server-reset') requireManager(i);
    return confirm(
      i,
      ctx,
      sub,
      sub === 'server-reset'
        ? 'Bu sunucunun tüm mesaj, ses ve katılım istatistikleri kalıcı olarak silinecek. Onaylıyor musunuz?'
        : 'Bu sunucudaki geçmiş istatistikleriniz silinecek. Yeni aktiviteleriniz tekrar sayılır. Onaylıyor musunuz?',
    );
  }
  requireManager(i);
  if (i.commandName === 'stat-channel') {
    if (sub === 'remove')
      return confirm(
        i,
        ctx,
        'remove-channels',
        'Botun oluşturduğu sayaç kanalları silinecek. Onaylıyor musunuz?',
      );
    await ctx.statChannels.setup(i.guild);
    return i.editReply('Sayaç kanalları oluşturuldu. Yaklaşık 10 dakikada bir güncellenir.');
  }
  if (sub === 'set') {
    const key = i.options.getString('key'),
      raw = i.options.getString('value');
    let value;
    try {
      value = key === 'timezone' ? raw : JSON.parse(raw);
    } catch {
      const e = new Error('Değer geçerli JSON olmalı. Örnek: true, 10 veya ["kanalID"].');
      e.expose = true;
      throw e;
    }
    ctx.tracker.tick(ctx.client);
    try {
      ctx.settings.update(i.guildId, { [key]: value });
    } catch (e) {
      e.expose = true;
      throw e;
    }
    ctx.tracker.reconcile(i.guild);
  }
  return i.editReply({
    embeds: [
      embed('Göztepe Stat Bot • Ayarlar').setDescription(
        '```json\n' + JSON.stringify(ctx.settings.get(i.guildId), null, 2).slice(0, 3900) + '\n```',
      ),
    ],
  });
}
export async function handleConfirmation(i, state, ctx) {
  if (state.action === 'cancel')
    return i.update({ content: 'İşlem iptal edildi.', components: [], embeds: [] });
  if (state.action !== 'confirm') throw new Error('Geçersiz işlem.');
  if (state.kind === 'server-reset' || state.kind === 'remove-channels') requireManager(i);
  await i.deferUpdate();
  if (state.kind === 'remove-channels') await ctx.statChannels.remove(i.guild);
  else if (state.kind === 'delete-my-data') {
    ctx.tracker.deleteUser(i.guildId, i.user.id);
    const member = await i.guild.members.fetch(i.user.id).catch(() => null);
    if (member?.voice.channel) ctx.tracker.voice({}, member.voice);
  } else if (state.kind === 'server-reset') {
    ctx.tracker.reset(i.guildId);
    ctx.tracker.reconcile(i.guild);
  } else throw new Error('Geçersiz onay.');
  return i.editReply({ content: 'İşlem tamamlandı.', embeds: [], components: [] });
}

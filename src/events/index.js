import { Events, MessageFlags } from 'discord.js';
import { runCommand } from '../commands/index.js';
import { leaderboard } from '../commands/core.js';
import { log } from '../utils/logger.js';
export function registerEvents(client, ctx) {
  const on = (event, fn) =>
    client.on(event, (...args) =>
      Promise.resolve()
        .then(() => fn(...args))
        .catch((e) => log.error(`Event ${event}`, e)),
    );
  on(Events.MessageCreate, (m) => ctx.tracker.message(m));
  on(Events.VoiceStateUpdate, (a, b) => ctx.tracker.voice(a, b));
  on(Events.GuildMemberAdd, (m) => ctx.repo.event(m.guild.id, m.id, 'join', Date.now()));
  on(Events.GuildMemberRemove, (m) => ctx.repo.event(m.guild.id, m.id, 'leave', Date.now()));
  on(Events.GuildMemberUpdate, (_old, member) => {
    const state = member.voice;
    if (state?.channel) ctx.tracker.voice(state, state);
  });
  on(Events.GuildCreate, (g) => ctx.tracker.reconcile(g));
  on(Events.GuildAvailable, (g) => ctx.tracker.reconcile(g));
  on(Events.ShardDisconnect, (_event, shardId) => {
    ctx.tracker.suspended.add(shardId);
  });
  on(Events.ShardReconnecting, (shardId) => {
    ctx.tracker.suspended.add(shardId);
  });
  const restore = (shardId) => {
    for (const g of client.guilds.cache.values())
      if (g.shardId === shardId) ctx.tracker.reconcile(g);
    ctx.tracker.suspended.delete(shardId);
  };
  on(Events.ShardResume, restore);
  on(Events.ShardReady, restore);
  const cooldowns = new Map();

  on(Events.InteractionCreate, async (i) => {
    if (!i.inGuild()) return;
    try {
      if (i.isButton()) {
        const state = ctx.buttons.take(i.customId, i, true);
        if (state.kind === 'top') {
          await i.deferUpdate();
          return i.editReply(
            await leaderboard(
              i,
              ctx,
              state.type,
              state.size,
              Math.max(0, state.page + (state.action === 'next' ? 1 : -1)),
            ),
          );
        }
        if (ctx.handleConfirmation) return ctx.handleConfirmation(i, state, ctx);
        return;
      }
      if (!i.isChatInputCommand()) return;
      const key = `${i.guildId}:${i.user.id}`,
        now = Date.now();
      if ((cooldowns.get(key) || 0) > now) {
        await i.reply({
          content: 'Lütfen komutlar arasında 3 saniye bekleyin.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      cooldowns.set(key, now + 3000);
      if (cooldowns.size > 10000)
        for (const [k, at] of cooldowns) if (at < now) cooldowns.delete(k);
      await i.deferReply({
        flags: ['privacy', 'settings', 'stat-channel'].includes(i.commandName)
          ? MessageFlags.Ephemeral
          : undefined,
      });
      ctx.tracker.flush();
      await runCommand(i, ctx);
    } catch (e) {
      log.error(`Interaction ${i.commandName || 'button'}`, e);
      const payload = {
        content: `İşlem tamamlanamadı: ${e.expose ? e.message : 'Ayarları ve bot yetkilerini kontrol edip tekrar deneyin.'}`,
        embeds: [],
        components: [],
      };
      if (i.deferred || i.replied) await i.editReply(payload).catch(() => {});
      else await i.reply({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  });
  on(Events.Error, (e) => log.error('Discord client', e));
  on(Events.Warn, (m) => log.warn(m));
}

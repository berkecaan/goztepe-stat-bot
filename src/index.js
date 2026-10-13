import { Client, GatewayIntentBits, Events, Options } from 'discord.js';
import { config } from './config/index.js';
import { SQLiteRepository } from './database/sqlite.js';
import { SettingsService } from './services/settings.js';
import { Tracker } from './services/tracker.js';
import { StatsService } from './services/stats.js';
import { ButtonStore } from './services/buttons.js';
import { deploy } from './services/deploy.js';
import { registerEvents } from './events/index.js';
import { ChartService } from './services/charts.js';
import { StatChannelService } from './services/statChannels.js';
import { handleConfirmation } from './commands/admin.js';
import { createDashboard } from './dashboard/server.js';
import { log } from './utils/logger.js';

if (!config.token || !config.clientId) {
  log.error('.env içinde DISCORD_TOKEN ve CLIENT_ID doldurulmalı.');
  process.exit(1);
}
const repo = new SQLiteRepository(config.databasePath),
  settings = new SettingsService(repo),
  tracker = new Tracker(repo, settings);
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
  makeCache: Options.cacheWithLimits({ ...Options.DefaultMakeCacheSettings, MessageManager: 0 }),
});
const ctx = {
  client,
  repo,
  settings,
  tracker,
  stats: new StatsService(repo, settings),
  buttons: new ButtonStore(),
};
ctx.charts = new ChartService(repo, settings);
ctx.statChannels = new StatChannelService(ctx);
ctx.handleConfirmation = handleConfirmation;
registerEvents(client, ctx);
const intervals = [];
let server,
  stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  intervals.forEach(clearInterval);
  try {
    tracker.tick(client);
    tracker.flush();
  } catch (e) {
    log.error('Son kayıt başarısız', e);
    code = 1;
  }
  client.destroy();
  if (server) server.close();
  repo.close();
  process.exitCode = code;
  setTimeout(() => process.exit(code), 1000).unref();
}
process.on('SIGTERM', () => shutdown());
process.on('SIGINT', () => shutdown());
process.on('unhandledRejection', (e) => log.error('Unhandled rejection', e));
// Continuing after unknown memory/state corruption is unsafe; persist and let host restart.
process.on('uncaughtException', (e) => {
  log.error('Uncaught exception; kontrollü kapanış', e);
  void shutdown(1);
});
client.once(Events.ClientReady, async () => {
  try {
    for (const guild of client.guilds.cache.values()) {
      await guild.members.fetch().catch((e) => log.warn('Üye listesi kısmi olabilir', e));
      tracker.reconcile(guild);
    }
    intervals.push(
      setInterval(() => {
        try {
          tracker.tick(client);
          ctx.buttons.prune();
          repo.cleanSessions();
        } catch (e) {
          log.error('Periyodik kayıt', e);
        }
      }, config.flushMs),
    );
    if (config.dashboardEnabled) {
      server = createDashboard(ctx, config).listen(config.port, '0.0.0.0', () =>
        log.info(`Dashboard port ${config.port}`),
      );
      server.on('error', (e) => log.error('Dashboard sunucusu', e));
    }
    let updating = false;
    intervals.push(
      setInterval(async () => {
        if (updating) return;
        updating = true;
        try {
          for (const g of client.guilds.cache.values())
            if (g.available) await ctx.statChannels.update(g);
        } catch (e) {
          log.error('Sayaç kanalı', e);
        } finally {
          updating = false;
        }
      }, 600000),
    );
    log.info(`${client.user.tag} bağlandı • Göztepe Stat Bot`);
  } catch (e) {
    log.error('Ready', e);
  }
});
try {
  if (config.autoDeploy) {
    await deploy(config);
    log.info('Slash komutları yüklendi.');
  }
  await client.login(config.token);
} catch (e) {
  log.error('Başlatma başarısız', e);
  await shutdown(1);
}

import dotenv from 'dotenv';
dotenv.config({ quiet: true });
export const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID || '',
  databasePath: process.env.DATABASE_PATH || './data/stats.sqlite',
  autoDeploy: process.env.AUTO_DEPLOY !== 'false',
  dashboardEnabled: process.env.DASHBOARD_ENABLED === 'true',
  port: Number(process.env.PORT || 3000),
  baseUrl: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  clientSecret: process.env.CLIENT_SECRET,
  sessionSecret: process.env.SESSION_SECRET,
  production: process.env.NODE_ENV === 'production',
  trustProxy: Number(process.env.TRUST_PROXY || 0),
  flushMs: 5000,
};
export const defaults = {
  countBots: false,
  excludedChannels: [],
  excludedRoles: [],
  timezone: 'Europe/Istanbul',
  leaderboardSize: 10,
  dashboardEnabled: true,
  resetHour: 0,
  statChannels: [],
  activityThresholds: { veryActive: 1000, active: 300, medium: 100, low: 1 },
};

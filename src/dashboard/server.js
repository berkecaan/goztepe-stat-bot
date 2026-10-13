import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { SQLiteSessionStore } from './sessionStore.js';
import { canManage } from '../utils/permissions.js';
import { ranges } from '../utils/time.js';
import { log } from '../utils/logger.js';
const dir = dirname(fileURLToPath(import.meta.url));
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const same = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function createDashboard(
  ctx,
  config,
  { fetcher = fetch, store = new SQLiteSessionStore(ctx.repo) } = {},
) {
  if (!config.clientSecret || !config.sessionSecret || config.sessionSecret.length < 32)
    throw new Error('Dashboard için CLIENT_SECRET ve en az 32 karakter SESSION_SECRET gerekli.');
  if (config.production && !config.baseUrl.startsWith('https://'))
    throw new Error('Production BASE_URL HTTPS olmalı.');
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'script-src': ["'self'"],
          'style-src': ["'self'"],
          'img-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
        },
      },
    }),
  );
  app.use(
    rateLimit({ windowMs: 60000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }),
  );
  app.use(express.json({ limit: '16kb' }));
  app.use(
    session({
      name: 'gs.sid',
      secret: config.sessionSecret,
      store,
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, secure: config.production, sameSite: 'lax', maxAge: 3600000 },
    }),
  );
  const authLimit = rateLimit({
    windowMs: 60000,
    limit: 15,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  async function discord(path, options = {}) {
    const r = await fetcher(`https://discord.com/api/v10${path}`, {
      ...options,
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`Discord OAuth isteği başarısız (${r.status})`);
    return r.json();
  }
  app.get('/auth/login', authLimit, (req, res, next) => {
    req.session.oauthState = randomBytes(32).toString('hex');
    req.session.oauthTime = Date.now();
    const q = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: `${config.baseUrl}/auth/callback`,
      response_type: 'code',
      scope: 'identify guilds',
      state: req.session.oauthState,
    });
    req.session.save((e) =>
      e ? next(e) : res.redirect(`https://discord.com/oauth2/authorize?${q}`),
    );
  });
  app.get(
    '/auth/callback',
    authLimit,
    asyncRoute(async (req, res) => {
      if (
        !same(req.query.state, req.session.oauthState) ||
        Date.now() - req.session.oauthTime > 300000 ||
        typeof req.query.code !== 'string'
      )
        return res
          .status(400)
          .send('Geçersiz veya süresi dolmuş OAuth oturumu. Tekrar giriş yapın.');
      delete req.session.oauthState;
      delete req.session.oauthTime;
      await new Promise((ok, no) => req.session.save((e) => (e ? no(e) : ok())));
      const token = await discord('/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          grant_type: 'authorization_code',
          code: req.query.code,
          redirect_uri: `${config.baseUrl}/auth/callback`,
        }),
      });
      const user = await discord('/users/@me', {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      const guilds = [];
      let after;
      for (let page = 0; page < 10; page++) {
        const list = await discord(`/users/@me/guilds?limit=200${after ? `&after=${after}` : ''}`, {
          headers: { Authorization: `Bearer ${token.access_token}` },
        });
        guilds.push(...list);
        if (list.length < 200) break;
        after = list[list.length - 1].id;
      }
      const managed = guilds
        .filter((g) => g.owner || (BigInt(g.permissions) & 40n) !== 0n)
        .map((g) => g.id);
      await new Promise((ok, no) => req.session.regenerate((e) => (e ? no(e) : ok())));
      req.session.user = { id: user.id, name: user.global_name || user.username };
      req.session.guildIds = managed;
      req.session.csrf = randomBytes(32).toString('hex');
      await new Promise((ok, no) => req.session.save((e) => (e ? no(e) : ok())));
      res.redirect('/');
    }),
  );
  app.use('/api', (req, res, next) =>
    req.session.user ? next() : res.status(401).json({ error: 'Discord ile giriş yapın.' }),
  );
  app.use('/api', (req, res, next) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      !same(req.get('X-CSRF-Token'), req.session.csrf)
    )
      return res.status(403).json({ error: 'Geçersiz CSRF token.' });
    next();
  });
  app.get('/api/me', (req, res) => res.json({ user: req.session.user, csrf: req.session.csrf }));
  app.post('/api/logout', (req, res, next) =>
    req.session.destroy((e) => {
      if (e) return next(e);
      res.clearCookie('gs.sid', { httpOnly: true, secure: config.production, sameSite: 'lax' });
      res.json({ ok: true });
    }),
  );
  async function allowed(req, gid) {
    const guild = ctx.client.guilds.cache.get(gid);
    if (!guild) return null;
    const member = await guild.members
      .fetch({ user: req.session.user.id, force: true })
      .catch(() => null);
    return member && canManage(member.permissions) ? guild : null;
  }
  app.get(
    '/api/guilds',
    asyncRoute(async (req, res) => {
      const result = [];
      for (const id of req.session.guildIds || []) {
        const g = await allowed(req, id);
        if (g)
          result.push({ id: g.id, name: g.name, enabled: ctx.settings.get(g.id).dashboardEnabled });
      }
      res.json(result);
    }),
  );
  app.use(
    '/api/guilds/:gid',
    asyncRoute(async (req, res, next) => {
      const guild = await allowed(req, req.params.gid);
      if (!guild) return res.status(403).json({ error: 'Bu sunucuyu yönetme yetkiniz yok.' });
      req.statsGuild = guild;
      if (!ctx.settings.get(guild.id).dashboardEnabled)
        return res
          .status(403)
          .json({ error: 'Dashboard bu sunucu için kapalı. /settings set ile açabilirsiniz.' });
      ctx.tracker.flush();
      next();
    }),
  );
  app.get('/api/guilds/:gid/overview', (req, res) => {
    const gid = req.statsGuild.id;
    res.json({
      summary: ctx.stats.server(req.statsGuild),
      chart: ctx.charts.series(gid, 'messages', '7d'),
      members: ctx.charts.members(gid),
    });
  });
  app.get('/api/guilds/:gid/members', (req, res) => {
    const g = req.statsGuild,
      offset = Math.max(0, Math.min(1000000, parseInt(req.query.offset) || 0));
    const rows = ctx.repo.top(g.id, 'messages', { limit: 51, offset });
    res.json({
      rows: rows
        .slice(0, 50)
        .map((r) => ({ ...r, name: g.members.cache.get(r.id)?.displayName || r.id })),
      more: rows.length > 50,
    });
  });
  app.get('/api/guilds/:gid/channels', (req, res) => {
    const g = req.statsGuild;
    const messages = ctx.repo.top(g.id, 'messages', { group: 'channel', limit: 500 }),
      voice = ctx.repo.top(g.id, 'voice', { group: 'channel', limit: 500 });
    const label = (r) => ({ ...r, name: g.channels.cache.get(r.id)?.name || r.id });
    res.json({ messages: messages.map(label), voice: voice.map(label) });
  });
  app.get('/api/guilds/:gid/leaderboards', (req, res) => {
    const g = req.statsGuild,
      s = ctx.settings.get(g.id),
      r = ranges(s),
      since =
        req.query.period === '7d' ? r.weekly : req.query.period === '30d' ? r.monthly : undefined;
    const offset = Math.max(0, Math.min(1000000, parseInt(req.query.offset) || 0)),
      limit = s.leaderboardSize;
    const label = (row) => ({ ...row, name: g.members.cache.get(row.id)?.displayName || row.id });
    res.json({
      messages: ctx.repo.top(g.id, 'messages', { since, limit, offset }).map(label),
      voice: ctx.repo.top(g.id, 'voice', { since, limit, offset }).map(label),
      size: limit,
    });
  });
  app.get('/api/guilds/:gid/activity', (req, res) => {
    res.json(
      ctx.charts.series(
        req.statsGuild.id,
        req.query.type === 'voice' ? 'voice' : 'messages',
        ['7d', '30d', '24h'].includes(req.query.period) ? req.query.period : '7d',
      ),
    );
  });
  app.get('/api/guilds/:gid/settings', (req, res) => res.json(ctx.settings.get(req.statsGuild.id)));
  app.patch('/api/guilds/:gid/settings', (req, res) => {
    try {
      ctx.tracker.tick(ctx.client);
      const s = ctx.settings.update(req.statsGuild.id, req.body);
      ctx.tracker.reconcile(req.statsGuild);
      res.json(s);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  const chartFile = resolve(
    dirname(fileURLToPath(import.meta.resolve('chart.js'))),
    'chart.umd.js',
  );
  app.get('/vendor/chart.js', (_req, res) => res.sendFile(chartFile));
  app.use(express.static(resolve(dir, 'public')));
  app.use((error, req, res, _next) => {
    log.error('Dashboard isteği başarısız', error);
    res
      .status(error.status === 400 ? 400 : 500)
      .json({ error: 'İşlem tamamlanamadı. Tekrar deneyin.' });
  });
  return app;
}

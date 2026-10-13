import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { defaults } from '../config/index.js';

/** Persistence boundary. Services use this repository, never a raw SQL connection.
 * A PostgreSQL adapter must implement these methods; see docs in README. */
export class SQLiteRepository {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.statements = new Map();
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
    this.migrate();
  }
  stmt(sql) {
    if (!this.statements.has(sql)) this.statements.set(sql, this.db.prepare(sql));
    return this.statements.get(sql);
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  migrate() {
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS migrations(version TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)',
    );
    const dir = new URL('./migrations/', import.meta.url);
    for (const name of readdirSync(dir)
      .filter((n) => n.endsWith('.sql'))
      .sort()) {
      if (this.db.prepare('SELECT 1 FROM migrations WHERE version=?').get(name)) continue;
      this.transaction(() => {
        this.db.exec(readFileSync(new URL(name, dir), 'utf8'));
        this.db.prepare('INSERT INTO migrations VALUES (?,?)').run(name, Date.now());
      });
    }
  }
  getSettings(gid) {
    const row = this.stmt('SELECT value FROM settings WHERE guild_id=?').get(gid);
    return { ...structuredClone(defaults), ...(row ? JSON.parse(row.value) : {}) };
  }
  setSettings(gid, value) {
    this.stmt(
      'INSERT INTO settings VALUES (?,?) ON CONFLICT(guild_id) DO UPDATE SET value=excluded.value',
    ).run(gid, JSON.stringify(value));
  }
  addBatch(rows) {
    this.transaction(() => {
      for (const r of rows) this.add(r);
    });
  }
  add(r) {
    this.stmt(
      `INSERT INTO activity_buckets VALUES (?,?,?,?,?,?) ON CONFLICT(guild_id,user_id,channel_id,bucket) DO UPDATE SET messages=messages+excluded.messages,voice_ms=voice_ms+excluded.voice_ms`,
    ).run(r.guildId, r.userId, r.channelId, r.bucket, r.messages || 0, r.voiceMs || 0);
    this.stmt(
      `INSERT INTO totals VALUES (?,?,?,?,?,?,?) ON CONFLICT(guild_id,user_id,channel_id) DO UPDATE SET messages=messages+excluded.messages,voice_ms=voice_ms+excluded.voice_ms,last_message=MAX(last_message,excluded.last_message),last_voice=MAX(last_voice,excluded.last_voice)`,
    ).run(
      r.guildId,
      r.userId,
      r.channelId,
      r.messages || 0,
      r.voiceMs || 0,
      r.lastMessage || 0,
      r.lastVoice || 0,
    );
  }
  filter(gid, { userId, channelId, since, until } = {}) {
    const parts = ['guild_id=?'],
      args = [gid];
    for (const [key, value] of [
      ['user_id', userId],
      ['channel_id', channelId],
    ])
      if (value) {
        parts.push(`${key}=?`);
        args.push(value);
      }
    if (since !== undefined) {
      parts.push('bucket>=?');
      args.push(since);
    }
    if (until !== undefined) {
      parts.push('bucket<?');
      args.push(until);
    }
    return { where: parts.join(' AND '), args };
  }
  aggregate(gid, opts = {}) {
    const { where, args } = this.filter(gid, opts);
    const timed = opts.since !== undefined || opts.until !== undefined;
    return this.stmt(
      `SELECT COALESCE(SUM(messages),0) messages,COALESCE(SUM(voice_ms),0) voiceMs ${timed ? '' : ', MAX(last_message) lastMessage,MAX(last_voice) lastVoice'} FROM ${timed ? 'activity_buckets' : 'totals'} WHERE ${where}`,
    ).get(...args);
  }
  top(gid, metric = 'messages', opts = {}) {
    const column = metric === 'voice' ? 'voice_ms' : 'messages';
    const group = opts.group === 'channel' ? 'channel_id' : 'user_id';
    const { where, args } = this.filter(gid, opts);
    const table =
      opts.since !== undefined || opts.until !== undefined ? 'activity_buckets' : 'totals';
    return this.stmt(
      `SELECT ${group} id,SUM(${column}) value FROM ${table} WHERE ${where} GROUP BY ${group} HAVING value>0 ORDER BY value DESC,${group} ASC LIMIT ? OFFSET ?`,
    ).all(...args, opts.limit || 20, opts.offset || 0);
  }
  rank(gid, uid, metric) {
    const col = metric === 'voice' ? 'voice_ms' : 'messages';
    return (
      this.stmt(
        `SELECT position FROM (SELECT user_id,RANK() OVER (ORDER BY SUM(${col}) DESC) position FROM totals WHERE guild_id=? GROUP BY user_id HAVING SUM(${col})>0) WHERE user_id=?`,
      ).get(gid, uid)?.position || null
    );
  }
  userTotals(gid) {
    return this.stmt(
      'SELECT user_id id,SUM(messages) messages,SUM(voice_ms) voiceMs,MAX(last_message) lastMessage,MAX(last_voice) lastVoice FROM totals WHERE guild_id=? GROUP BY user_id',
    ).all(gid);
  }
  active(gid, since) {
    return this.stmt(
      'SELECT COUNT(DISTINCT user_id) n FROM activity_buckets WHERE guild_id=? AND bucket>=? AND (messages>0 OR voice_ms>0)',
    ).get(gid, since).n;
  }
  series(gid, start, end, step, metric) {
    const col = metric === 'voice' ? 'voice_ms' : 'messages';
    return this.stmt(
      `SELECT CAST((bucket-?)/? AS INTEGER) slot,SUM(${col}) value FROM activity_buckets WHERE guild_id=? AND bucket>=? AND bucket<? GROUP BY slot ORDER BY slot`,
    ).all(start, step, gid, start, end);
  }
  sessions(gid) {
    return gid
      ? this.stmt('SELECT * FROM voice_sessions WHERE guild_id=?').all(gid)
      : this.stmt('SELECT * FROM voice_sessions').all();
  }
  session(gid, uid) {
    return this.stmt('SELECT * FROM voice_sessions WHERE guild_id=? AND user_id=?').get(gid, uid);
  }
  startVoice(gid, uid, cid, ts) {
    this.stmt(
      'INSERT INTO voice_sessions VALUES (?,?,?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET channel_id=excluded.channel_id,started_at=excluded.started_at,checkpoint_at=excluded.checkpoint_at',
    ).run(gid, uid, cid, ts, ts);
  }
  checkpointVoice(gid, uid, at, rows, close = false) {
    this.checkpointVoices([{ gid, uid, at, rows, close }]);
  }
  checkpointVoices(plans) {
    if (!plans.length) return;
    this.transaction(() => {
      for (const { gid, uid, at, rows, close } of plans) {
        for (const row of rows) this.add(row);
        if (close)
          this.stmt('DELETE FROM voice_sessions WHERE guild_id=? AND user_id=?').run(gid, uid);
        else
          this.stmt('UPDATE voice_sessions SET checkpoint_at=? WHERE guild_id=? AND user_id=?').run(
            at,
            gid,
            uid,
          );
      }
    });
  }
  event(gid, uid, kind, at) {
    this.stmt('INSERT INTO member_events(guild_id,user_id,kind,happened_at) VALUES (?,?,?,?)').run(
      gid,
      uid,
      kind,
      at,
    );
  }
  memberCounts(gid, since, until = Date.now() + 1) {
    const rows = this.stmt(
      'SELECT kind,COUNT(*) n FROM member_events WHERE guild_id=? AND happened_at>=? AND happened_at<? GROUP BY kind',
    ).all(gid, since, until);
    return {
      joins: rows.find((r) => r.kind === 'join')?.n || 0,
      leaves: rows.find((r) => r.kind === 'leave')?.n || 0,
    };
  }
  deleteUser(gid, uid) {
    this.transaction(() => {
      for (const table of ['totals', 'activity_buckets', 'voice_sessions', 'member_events'])
        this.stmt(`DELETE FROM ${table} WHERE guild_id=? AND user_id=?`).run(gid, uid);
    });
  }
  resetGuild(gid) {
    this.transaction(() => {
      for (const table of ['totals', 'activity_buckets', 'voice_sessions', 'member_events'])
        this.stmt(`DELETE FROM ${table} WHERE guild_id=?`).run(gid);
    });
  }
  sessionGet(sid) {
    return this.stmt('SELECT value FROM web_sessions WHERE sid=? AND expires>?').get(
      sid,
      Date.now(),
    )?.value;
  }
  sessionSet(sid, value, expires) {
    this.stmt(
      'INSERT INTO web_sessions VALUES (?,?,?) ON CONFLICT(sid) DO UPDATE SET value=excluded.value,expires=excluded.expires',
    ).run(sid, value, expires);
  }
  sessionDelete(sid) {
    this.stmt('DELETE FROM web_sessions WHERE sid=?').run(sid);
  }
  cleanSessions() {
    this.stmt('DELETE FROM web_sessions WHERE expires<?').run(Date.now());
  }
  close() {
    this.db.close();
  }
}

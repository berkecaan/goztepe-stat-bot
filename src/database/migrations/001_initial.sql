CREATE TABLE settings (guild_id TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE totals (
 guild_id TEXT NOT NULL, user_id TEXT NOT NULL, channel_id TEXT NOT NULL,
 messages INTEGER NOT NULL DEFAULT 0, voice_ms INTEGER NOT NULL DEFAULT 0,
 last_message INTEGER NOT NULL DEFAULT 0, last_voice INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(guild_id,user_id,channel_id)
);
CREATE TABLE activity_buckets (
 guild_id TEXT NOT NULL, user_id TEXT NOT NULL, channel_id TEXT NOT NULL, bucket INTEGER NOT NULL,
 messages INTEGER NOT NULL DEFAULT 0, voice_ms INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(guild_id,user_id,channel_id,bucket)
);
CREATE INDEX activity_time ON activity_buckets(guild_id,bucket);
CREATE INDEX activity_user ON activity_buckets(guild_id,user_id,bucket);
CREATE INDEX activity_channel ON activity_buckets(guild_id,channel_id,bucket);
CREATE TABLE voice_sessions (
 guild_id TEXT NOT NULL,user_id TEXT NOT NULL,channel_id TEXT NOT NULL,
 started_at INTEGER NOT NULL, checkpoint_at INTEGER NOT NULL,
 PRIMARY KEY(guild_id,user_id)
);
CREATE TABLE member_events (id INTEGER PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('join','leave')), happened_at INTEGER NOT NULL);
CREATE INDEX member_events_time ON member_events(guild_id,happened_at);
CREATE TABLE web_sessions (sid TEXT PRIMARY KEY, value TEXT NOT NULL, expires INTEGER NOT NULL);

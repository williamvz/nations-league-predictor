import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.DB_PATH || './data/nlpool.db';

fs.mkdirSync(path.dirname(path.resolve(DB_PATH)), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',     -- active | pending (awaiting admin approval)
  avatar TEXT NOT NULL DEFAULT '⚽',
  favorite_team_id INTEGER REFERENCES teams(id),
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name_nl TEXT NOT NULL,
  name_en TEXT NOT NULL,
  group_name TEXT NOT NULL,
  flag TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  matchday INTEGER NOT NULL,
  group_name TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'league',      -- league | quarterfinal | semifinal | third_place | final
  home_team_id INTEGER NOT NULL REFERENCES teams(id),
  away_team_id INTEGER NOT NULL REFERENCES teams(id),
  kickoff_utc TEXT NOT NULL,                 -- ISO 8601 UTC
  kickoff_confirmed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'scheduled',  -- scheduled | live | finished | postponed
  minute TEXT,                               -- live match clock, e.g. "73'"
  home_score INTEGER,
  away_score INTEGER,
  result_source TEXT,                        -- espn | thesportsdb | manual
  provider_ids TEXT NOT NULL DEFAULT '{}',   -- {"espn":"...","tsdb":"..."}
  points_calculated INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (home_team_id, away_team_id, stage)
);

CREATE TABLE IF NOT EXISTS predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  home_goals INTEGER NOT NULL CHECK (home_goals BETWEEN 0 AND 20),
  away_goals INTEGER NOT NULL CHECK (away_goals BETWEEN 0 AND 20),
  is_joker INTEGER NOT NULL DEFAULT 0,       -- doubles points; max 1 per matchday
  points REAL,                               -- NULL until match finished + calculated
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, match_id)
);

CREATE TABLE IF NOT EXISTS bonus_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_key TEXT NOT NULL UNIQUE,         -- e.g. winner_A1, top_scorer, points_ned
  question_nl TEXT NOT NULL,
  answer_type TEXT NOT NULL,                 -- team | player | number
  team_group TEXT,                           -- for team questions: restrict choices to this group
  deadline_utc TEXT NOT NULL,
  points INTEGER NOT NULL,
  points_close INTEGER NOT NULL DEFAULT 0,   -- partial points for number questions (±1)
  correct_team_id INTEGER REFERENCES teams(id),
  correct_text TEXT,                         -- for player questions: JSON array of accepted names
  correct_number INTEGER,
  resolved INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bonus_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES bonus_questions(id) ON DELETE CASCADE,
  answer_team_id INTEGER REFERENCES teams(id),
  answer_text TEXT,
  answer_number INTEGER,
  points INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, question_id)
);

CREATE TABLE IF NOT EXISTS matchday_snapshots (
  matchday INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  total_points INTEGER NOT NULL,
  matchday_points INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (matchday, user_id)
);

CREATE TABLE IF NOT EXISTS match_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL DEFAULT 'goal',   -- goal | own_goal | penalty
  player_name TEXT NOT NULL,
  team_id INTEGER REFERENCES teams(id),
  minute TEXT,
  UNIQUE (match_id, event_type, player_name, minute)
);

CREATE TABLE IF NOT EXISTS scorers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_name TEXT NOT NULL,
  team_id INTEGER REFERENCES teams(id),
  goals INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'sync',       -- sync | manual
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (player_name, team_id)
);

CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_key TEXT NOT NULL,
  unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
  seen INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, achievement_key)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,  -- NULL = broadcast
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  meta TEXT,                                 -- JSON payload for actionable notifications
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_reads (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  read_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, notification_id)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  keys_json TEXT NOT NULL,                   -- {p256dh, auth}
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  job TEXT NOT NULL,                         -- fixtures | scores | scorers | finalize
  provider TEXT,
  ok INTEGER NOT NULL,
  message TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matches_kickoff ON matches(kickoff_utc);
CREATE INDEX IF NOT EXISTS idx_predictions_match ON predictions(match_id);
CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_ts ON sync_log(ts);
`);

// idempotent migrations for databases created before a column existed
const userCols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!userCols.includes('status')) {
  db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
}
const notifCols = db.prepare("PRAGMA table_info(notifications)").all().map((c) => c.name);
if (!notifCols.includes('meta')) {
  db.exec('ALTER TABLE notifications ADD COLUMN meta TEXT');
}
const matchCols = db.prepare("PRAGMA table_info(matches)").all().map((c) => c.name);
if (!matchCols.includes('winner_team_id')) {
  // knockout matches can end level after 90 minutes; the shootout/extra-time
  // winner decides who advances (and the champion bonus question)
  db.exec('ALTER TABLE matches ADD COLUMN winner_team_id INTEGER REFERENCES teams(id)');
}

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

export default db;

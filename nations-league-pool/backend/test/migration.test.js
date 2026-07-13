// Upgrade-path test: open a database created by an OLDER app version (v1.0
// schema, mid-season data already in it), then boot the current code against
// it. Migrations must add the new columns and tables without touching any
// existing record.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nlpool-mig-'));
const dbPath = path.join(tmp, 'old.db');
process.env.DB_PATH = dbPath;
process.env.JWT_SECRET = 'test-secret';
process.env.ADMIN_PASSWORD = 'admin-pw-123';

// --- build a v1.0.0-era database by hand: no users.status, no
// notifications.meta, no matches.winner_team_id, no push_subscriptions
const old = new Database(dbPath);
old.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    avatar TEXT NOT NULL DEFAULT '⚽',
    favorite_team_id INTEGER,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
  );
  CREATE TABLE teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE, name_nl TEXT NOT NULL, name_en TEXT NOT NULL,
    group_name TEXT NOT NULL, flag TEXT NOT NULL, aliases TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    matchday INTEGER NOT NULL, group_name TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'league',
    home_team_id INTEGER NOT NULL, away_team_id INTEGER NOT NULL,
    kickoff_utc TEXT NOT NULL, kickoff_confirmed INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'scheduled', minute TEXT,
    home_score INTEGER, away_score INTEGER, result_source TEXT,
    provider_ids TEXT NOT NULL DEFAULT '{}',
    points_calculated INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (home_team_id, away_team_id, stage)
  );
  CREATE TABLE predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL, match_id INTEGER NOT NULL,
    home_goals INTEGER NOT NULL, away_goals INTEGER NOT NULL,
    is_joker INTEGER NOT NULL DEFAULT 0, points REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, match_id)
  );
  CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER, type TEXT NOT NULL, title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
// mid-season records an update must never lose
old.prepare("INSERT INTO users (username, display_name, password_hash, is_admin) VALUES ('william', 'William', 'hash-w', 1)").run();
old.prepare("INSERT INTO users (username, display_name, password_hash) VALUES ('pepijn', 'Pepijn', 'hash-p')").run();
old.prepare("INSERT INTO teams (code, name_nl, name_en, group_name, flag) VALUES ('NED', 'Nederland', 'Netherlands', 'A2', '🇳🇱')").run();
old.prepare("INSERT INTO teams (code, name_nl, name_en, group_name, flag) VALUES ('GER', 'Duitsland', 'Germany', 'A2', '🇩🇪')").run();
old.prepare(`
  INSERT INTO matches (matchday, group_name, home_team_id, away_team_id, kickoff_utc, status, home_score, away_score, result_source, points_calculated)
  VALUES (1, 'A2', 1, 2, '2026-09-24T18:45:00.000Z', 'finished', 2, 1, 'espn', 1)
`).run();
old.prepare('INSERT INTO predictions (user_id, match_id, home_goals, away_goals, is_joker, points) VALUES (2, 1, 2, 1, 1, 10)').run();
old.prepare("INSERT INTO notifications (user_id, type, title) VALUES (NULL, 'result', 'Nederland 2 - 1 Duitsland')").run();
old.close();

test('current code upgrades a v1.0 database in place, keeping every record', async () => {
  const db = (await import('../src/db/database.js')).default; // runs migrations on import

  // new columns exist with correct defaults on OLD rows
  const william = db.prepare("SELECT * FROM users WHERE username = 'william'").get();
  assert.equal(william.status, 'active', 'existing users become/stay active');
  assert.equal(william.is_admin, 1);
  const match = db.prepare('SELECT * FROM matches WHERE id = 1').get();
  assert.equal(match.winner_team_id, null, 'winner_team_id added, null for old rows');
  assert.equal(match.home_score, 2, 'result untouched');
  const notif = db.prepare('SELECT * FROM notifications WHERE id = 1').get();
  assert.equal(notif.meta, null, 'meta column added');
  assert.equal(notif.title, 'Nederland 2 - 1 Duitsland');

  // new tables from later versions were created
  for (const table of ['push_subscriptions', 'matchday_snapshots', 'match_events', 'bonus_questions', 'sync_log']) {
    assert.ok(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table),
      `table ${table} created on upgrade`
    );
  }

  // pre-existing records fully intact
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 2);
  const pred = db.prepare('SELECT * FROM predictions WHERE user_id = 2').get();
  assert.equal(pred.points, 10, 'scored prediction preserved (joker exact)');
  assert.equal(pred.is_joker, 1);

  // idempotent seed must NOT wipe or duplicate anything: teams table is
  // non-empty (2 rows) so fixtures/teams are left alone; the admin exists so
  // no second admin is created; only genuinely new bonus questions appear
  const { seed } = await import('../src/db/seed.js');
  seed();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM teams').get().n, 2, 'partial team set untouched');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM matches').get().n, 1, 'existing fixtures untouched');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1').get().n, 1, 'no duplicate admin');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM predictions').get().n, 1, 'predictions preserved');
  assert.equal(db.prepare("SELECT status FROM users WHERE username = 'pepijn'").get().status, 'active');

  // and seeding again is still a no-op
  seed();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM predictions').get().n, 1);
});

// End-to-end flow against a throwaway DB: seed → predict → result → points →
// standings → matchday finalize → bonus resolution.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nlpool-test-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret';
process.env.ADMIN_PASSWORD = 'test-admin-pw';

const db = (await import('../src/db/database.js')).default;
const { seed } = await import('../src/db/seed.js');
const { processMatchResult, finalizeMatchdayIfComplete } = await import('../src/services/scoring.js');
const { computeGroupStandings } = await import('../src/services/standings.js');
const { resolveBonusQuestions } = await import('../src/services/bonus.js');
const { findTeam } = await import('../src/sync/matcher.js');

test('seed is idempotent', () => {
  seed();
  seed();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM teams').get().n, 16);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM matches').get().n, 48);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bonus_questions').get().n, 7);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1').get().n, 1);
});

test('team matcher handles provider name variants', () => {
  assert.equal(findTeam('Netherlands').code, 'NED');
  assert.equal(findTeam('netherlands ').code, 'NED');
  assert.equal(findTeam('Türkiye').code, 'TUR');
  assert.equal(findTeam('Turkey').code, 'TUR');
  assert.equal(findTeam('Czech Republic').code, 'CZE');
  assert.equal(findTeam('Nonexististan'), null);
});

test('full scoring flow', () => {
  // create two players
  db.prepare("INSERT INTO users (username, display_name, password_hash) VALUES ('piet', 'Piet', 'x')").run();
  db.prepare("INSERT INTO users (username, display_name, password_hash) VALUES ('kees', 'Kees', 'x')").run();
  const piet = db.prepare("SELECT id FROM users WHERE username = 'piet'").get().id;
  const kees = db.prepare("SELECT id FROM users WHERE username = 'kees'").get().id;

  const match = db.prepare(`
    SELECT m.id, m.matchday FROM matches m
    JOIN teams th ON th.id = m.home_team_id
    WHERE th.code = 'NED' AND m.matchday = 1
  `).get();

  // piet: exact with joker; kees: winner only
  db.prepare('INSERT INTO predictions (user_id, match_id, home_goals, away_goals, is_joker) VALUES (?, ?, 2, 1, 1)').run(piet, match.id);
  db.prepare('INSERT INTO predictions (user_id, match_id, home_goals, away_goals) VALUES (?, ?, 3, 1)').run(kees, match.id);

  db.prepare("UPDATE matches SET status = 'finished', home_score = 2, away_score = 1, result_source = 'espn' WHERE id = ?").run(match.id);
  processMatchResult(match.id, { notify: false });

  assert.equal(db.prepare('SELECT points FROM predictions WHERE user_id = ? AND match_id = ?').get(piet, match.id).points, 10);
  assert.equal(db.prepare('SELECT points FROM predictions WHERE user_id = ? AND match_id = ?').get(kees, match.id).points, 2);

  // achievements fired
  const pietAch = db.prepare('SELECT achievement_key FROM achievements WHERE user_id = ?').all(piet).map((r) => r.achievement_key);
  assert.ok(pietAch.includes('sharpshooter'));
  assert.ok(pietAch.includes('joker_hit'));
});

test('standings + matchday finalize + bonus resolve', () => {
  // finish all of group A2 with NED winning everything 1-0
  const a2 = db.prepare("SELECT * FROM matches WHERE group_name = 'A2'").all();
  const ned = db.prepare("SELECT id FROM teams WHERE code = 'NED'").get().id;
  for (const m of a2) {
    if (m.status === 'finished') continue;
    const nedHome = m.home_team_id === ned;
    const [h, a] = nedHome ? [1, 0] : m.away_team_id === ned ? [0, 1] : [2, 2];
    db.prepare("UPDATE matches SET status = 'finished', home_score = ?, away_score = ?, result_source = 'espn' WHERE id = ?")
      .run(h, a, m.id);
    processMatchResult(m.id, { notify: false });
  }

  const standings = computeGroupStandings('A2');
  assert.equal(standings[0].team_id, ned);
  assert.equal(standings[0].points, 18); // 6 wins (incl. the earlier 2-1)
  assert.equal(standings[0].played, 6);

  // group winner bonus resolves automatically
  const pietId = db.prepare("SELECT id FROM users WHERE username = 'piet'").get().id;
  const q = db.prepare("SELECT * FROM bonus_questions WHERE question_key = 'winner_A2'").get();
  db.prepare('INSERT INTO bonus_answers (user_id, question_id, answer_team_id) VALUES (?, ?, ?)').run(pietId, q.id, ned);
  resolveBonusQuestions();
  const resolved = db.prepare("SELECT * FROM bonus_questions WHERE question_key = 'winner_A2'").get();
  assert.equal(resolved.resolved, 1);
  assert.equal(resolved.correct_team_id, ned);
  assert.equal(db.prepare('SELECT points FROM bonus_answers WHERE user_id = ? AND question_id = ?').get(pietId, q.id).points, 5);

  // points_ned bonus: NED took 16 points
  const qNed = db.prepare("SELECT * FROM bonus_questions WHERE question_key = 'points_ned'").get();
  assert.equal(qNed.resolved, 1);
  assert.equal(qNed.correct_number, 18);
});

test('matchday snapshot created when matchday completes', () => {
  // finish every remaining matchday-1 match
  const md1 = db.prepare("SELECT id, status FROM matches WHERE matchday = 1").all();
  for (const m of md1) {
    if (m.status !== 'finished') {
      db.prepare("UPDATE matches SET status = 'finished', home_score = 1, away_score = 1, result_source = 'espn' WHERE id = ?").run(m.id);
      processMatchResult(m.id, { notify: false });
    }
  }
  finalizeMatchdayIfComplete(1);
  const snaps = db.prepare('SELECT COUNT(*) AS n FROM matchday_snapshots WHERE matchday = 1').get().n;
  assert.ok(snaps >= 3, 'snapshot rows for all users');
});

// De Sportkrant + Kristallen Bol: recap generation on matchday finalize and
// the personal stats math.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nlpool-extras-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret';
process.env.ADMIN_USERNAME = 'william';
process.env.ADMIN_PASSWORD = 'admin-pw-123';

const db = (await import('../src/db/database.js')).default;
const { seed } = await import('../src/db/seed.js');
seed();
const { processMatchResult } = await import('../src/services/scoring.js');
const { composeRecap } = await import('../src/services/sportkrant.js');
const { computeUserStats } = await import('../src/services/stats.js');

// two players with contrasting rounds
db.prepare("INSERT INTO users (username, display_name, password_hash) VALUES ('anna', 'Anna', 'x')").run();
db.prepare("INSERT INTO users (username, display_name, password_hash) VALUES ('bram', 'Bram', 'x')").run();
const anna = db.prepare("SELECT id FROM users WHERE username = 'anna'").get().id;
const bram = db.prepare("SELECT id FROM users WHERE username = 'bram'").get().id;

const md1 = db.prepare("SELECT * FROM matches WHERE matchday = 1 ORDER BY id").all();
const ins = db.prepare('INSERT INTO predictions (user_id, match_id, home_goals, away_goals, is_joker) VALUES (?, ?, ?, ?, ?)');
for (const [i, m] of md1.entries()) {
  ins.run(anna, m.id, 2, 1, i === 0 ? 1 : 0); // anna: 2-1 everywhere, joker on the first
  if (i < 6) ins.run(bram, m.id, 0, 3, i === 1 ? 1 : 0); // bram: always 0-3, skips two matches
}
for (const m of md1) {
  db.prepare("UPDATE matches SET status = 'finished', home_score = 2, away_score = 1, result_source = 'espn' WHERE id = ?").run(m.id);
  processMatchResult(m.id, { notify: false });
}

test('Sportkrant publishes automatically when the matchday finalizes', () => {
  const recap = db.prepare('SELECT * FROM recaps WHERE matchday = 1').get();
  assert.ok(recap, 'recap stored by finalizeMatchdayIfComplete');
  assert.match(recap.title, /Sportkrant/);
  assert.match(recap.body, /\*\*Anna\*\*/, 'day winner named');
  assert.match(recap.body, /joker/i, 'joker paragraph present');
  assert.match(recap.body, /Bram.*(vergat|Wekker)/s, 'forgetter called out');
  const notif = db.prepare("SELECT * FROM notifications WHERE type = 'sportkrant'").get();
  assert.ok(notif, 'broadcast sent');
});

test('recap is deterministic and only published once', () => {
  const again = composeRecap(1);
  const stored = db.prepare('SELECT * FROM recaps WHERE matchday = 1').get();
  assert.equal(again.body, stored.body, 'same phrasing on re-compose');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM recaps').get().n, 1);
});

test('Kristallen Bol stats: classification, joker bonus, teams', () => {
  // a second round so every team has ≥2 matches (needed for team affinity)
  const md2 = db.prepare("SELECT * FROM matches WHERE matchday = 2 ORDER BY id").all();
  for (const m of md2) {
    ins.run(anna, m.id, 1, 0, 0);
    db.prepare("UPDATE matches SET status = 'finished', home_score = 1, away_score = 0, result_source = 'espn' WHERE id = ?").run(m.id);
    processMatchResult(m.id, { notify: false });
  }

  const s = computeUserStats(anna);
  assert.equal(s.scored, 16);
  assert.equal(s.counts.exact, 16, 'anna hit everything exactly');
  assert.equal(s.accuracy, 100);
  assert.equal(s.joker.used, 1);
  assert.equal(s.joker.hits, 1);
  assert.equal(s.joker.extra_points, 5, 'joker doubled a 5-point exact → +5 bonus');
  assert.ok(s.best_team, 'team affinity computed');
  assert.equal(s.best_team.avg, 5, 'perfect predictor: 5 base points per match');
  assert.equal(s.best_prediction.points, 10);

  const b = computeUserStats(bram);
  assert.equal(b.scored, 6);
  assert.equal(b.counts.miss, 6, 'bram missed everything (0-3 vs 2-1)');
  assert.equal(b.accuracy, 0);
  assert.ok(b.biggest_miss, 'painful miss identified');
  assert.equal(b.biggest_miss.others_scored, 1, 'anna scored on that match');
});

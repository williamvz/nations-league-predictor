// Simulator/demo-mode regression tests. The live demo exposed a real bug:
// with the season compressed into an hour, a knockout event between two
// teams that also met in the league phase (same group) was swallowed by the
// ±36h team-pair matcher and the semifinal was never created. These tests
// pin the fix and then fast-forward a complete simulated season.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nlpool-sim-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret';
process.env.ADMIN_PASSWORD = 'admin-pw-123';
process.env.DEMO_MODE = '1';
process.env.DEMO_MATCHDAY_MINUTES = '0.01'; // whole league kicks off ~instantly
process.env.SIM_MATCH_MINUTES = '0.001';    // and finishes instantly

const db = (await import('../src/db/database.js')).default;
const { seed } = await import('../src/db/seed.js');
seed();
const { applyEvent } = await import('../src/sync/engine.js');
const { fetchSimulatedEvents } = await import('../src/sync/providers/simulator.js');
const { resolveBonusQuestions } = await import('../src/services/bonus.js');

test('regression: knockout event between same-group teams creates a NEW match', () => {
  // Spanje and Tsjechië share group A3 and have a seeded league fixture.
  const esp = db.prepare("SELECT * FROM teams WHERE code = 'ESP'").get();
  const cze = db.prepare("SELECT * FROM teams WHERE code = 'CZE'").get();
  const league = db.prepare(
    "SELECT * FROM matches WHERE home_team_id = ? AND away_team_id = ? AND stage = 'league'"
  ).get(esp.id, cze.id);
  assert.ok(league, 'league fixture ESP-CZE exists');

  // a semifinal between the same two teams, kicking off within 36h of the
  // league fixture (exactly the compressed-demo situation)
  const r = applyEvent({
    providerId: 'sim-ko-test',
    homeName: esp.name_en, awayName: cze.name_en,
    homeScore: null, awayScore: null, status: 'scheduled', minute: null,
    kickoffIso: league.kickoff_utc,
    stage: 'semifinal', matchday: 9, goals: [],
  }, 'sim');
  assert.equal(r.matched, true);

  const semi = db.prepare(
    "SELECT * FROM matches WHERE home_team_id = ? AND away_team_id = ? AND stage = 'semifinal'"
  ).get(esp.id, cze.id);
  assert.ok(semi, 'a separate semifinal row was created');
  assert.notEqual(semi.id, league.id, 'league match untouched');
  db.prepare('DELETE FROM matches WHERE id = ?').run(semi.id); // clean slate for the season test
});

test('full simulated season reaches a champion (fast-forwarded)', () => {
  // every sync tick, then jump any not-yet-started fixtures into the past so
  // the next tick finishes them — a whole season in a few iterations
  let champion = null;
  for (let tick = 0; tick < 40 && !champion; tick++) {
    const events = fetchSimulatedEvents();
    for (const ev of events) applyEvent(ev, 'sim');
    resolveBonusQuestions();
    db.prepare(`
      UPDATE matches SET kickoff_utc = datetime('now', '-1 hour')
      WHERE status = 'scheduled'
    `).run();
    const q = db.prepare("SELECT * FROM bonus_questions WHERE question_key = 'champion' AND resolved = 1").get();
    if (q) champion = q.correct_team_id;
  }

  assert.ok(champion, 'champion bonus resolved');
  const byStage = Object.fromEntries(
    db.prepare('SELECT stage, COUNT(*) n FROM matches GROUP BY stage').all().map((r) => [r.stage, r.n])
  );
  assert.equal(byStage.league, 48);
  assert.equal(byStage.quarterfinal, 8, 'four two-legged QF ties');
  assert.equal(byStage.semifinal, 2, 'both semifinals exist');
  assert.equal(byStage.third_place, 1);
  assert.equal(byStage.final, 1);
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM matches WHERE status != 'finished'").get().n, 0,
    'entire simulated tournament finished'
  );
  // knockout matches that ended level all carry a shootout winner
  const levelKo = db.prepare(
    "SELECT COUNT(*) n FROM matches WHERE stage != 'league' AND home_score = away_score AND winner_team_id IS NULL"
  ).get().n;
  assert.equal(levelKo, 0, 'no drawn knockout without a winner');
  // the champion actually won the final
  const final = db.prepare("SELECT * FROM matches WHERE stage = 'final'").get();
  const finalWinner = final.winner_team_id
    || (final.home_score > final.away_score ? final.home_team_id : final.away_team_id);
  assert.equal(champion, finalWinner);
});

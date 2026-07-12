// Knockout auto-creation, finals classification, multipliers, pens winner
// and the champion bonus — driven through the sync engine's applyEvent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nlpool-ko-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret';
process.env.ADMIN_PASSWORD = 'admin-pw-123';

const db = (await import('../src/db/database.js')).default;
const { seed } = await import('../src/db/seed.js');
seed();
const { applyEvent, inferKnockoutStage, classifyFinals } = await import('../src/sync/engine.js');
const { resolveBonusQuestions } = await import('../src/services/bonus.js');

const admin = db.prepare('SELECT id FROM users LIMIT 1').get().id;

function ev(over) {
  return {
    providerId: over.id, homeName: over.home, awayName: over.away,
    homeScore: over.hs ?? null, awayScore: over.as ?? null,
    status: over.status || 'scheduled', minute: null,
    kickoffIso: over.kickoff, goals: [], winnerName: over.winner || null,
    ...over,
  };
}

test('stage inference windows', () => {
  assert.equal(inferKnockoutStage('2027-03-25T19:45:00.000Z'), 'quarterfinal');
  assert.equal(inferKnockoutStage('2027-06-08T19:00:00.000Z'), 'semifinal');
  assert.equal(inferKnockoutStage('2026-09-24T18:45:00.000Z'), null);
});

test('quarterfinal auto-created from provider event, both legs', () => {
  const r1 = applyEvent(ev({ id: 'qf1', home: 'Netherlands', away: 'Spain', kickoff: '2027-03-25T19:45:00.000Z' }), 'espn');
  assert.equal(r1.matched, true);
  const leg1 = db.prepare("SELECT * FROM matches WHERE stage = 'quarterfinal' AND matchday = 7").get();
  assert.ok(leg1, 'first leg created with matchday 7');

  applyEvent(ev({ id: 'qf2', home: 'Spain', away: 'Netherlands', kickoff: '2027-03-28T19:45:00.000Z' }), 'espn');
  const leg2 = db.prepare("SELECT * FROM matches WHERE stage = 'quarterfinal' AND matchday = 8").get();
  assert.ok(leg2, 'return leg created with matchday 8');

  // re-applying the same event does not duplicate
  applyEvent(ev({ id: 'qf1', home: 'Netherlands', away: 'Spain', kickoff: '2027-03-25T19:45:00.000Z' }), 'tsdb');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM matches WHERE stage = 'quarterfinal'").get().n, 2);

  // unknown (League B) team → ignored, e.g. relegation playoff
  const r = applyEvent(ev({ id: 'po1', home: 'Serbia', away: 'Sweden', kickoff: '2027-03-25T17:00:00.000Z' }), 'espn');
  assert.equal(r.matched, false);
});

test('knockout scoring uses stage multiplier + pens winner stored', () => {
  const leg1 = db.prepare("SELECT * FROM matches WHERE stage = 'quarterfinal' AND matchday = 7").get();
  db.prepare('INSERT INTO predictions (user_id, match_id, home_goals, away_goals) VALUES (?, ?, 1, 1)').run(admin, leg1.id);

  applyEvent(ev({
    id: 'qf1', home: 'Netherlands', away: 'Spain', kickoff: '2027-03-25T19:45:00.000Z',
    status: 'finished', hs: 1, as: 1, winner: 'Netherlands',
  }), 'espn');

  const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(leg1.id);
  assert.equal(updated.status, 'finished');
  const ned = db.prepare("SELECT id FROM teams WHERE code = 'NED'").get().id;
  assert.equal(updated.winner_team_id, ned, 'shootout winner stored');

  const pred = db.prepare('SELECT points FROM predictions WHERE match_id = ?').get(leg1.id);
  assert.equal(pred.points, 7.5, 'exact score × quarterfinal multiplier 1.5');
});

test('finals classification + champion bonus resolution', () => {
  // four Finals-week events arrive as generic June matches
  applyEvent(ev({ id: 'sf1', home: 'France', away: 'Germany', kickoff: '2027-06-01T19:00:00.000Z' }), 'espn');
  applyEvent(ev({ id: 'sf2', home: 'Spain', away: 'Portugal', kickoff: '2027-06-02T19:00:00.000Z' }), 'espn');
  applyEvent(ev({ id: 'm3', home: 'Germany', away: 'Portugal', kickoff: '2027-06-06T13:00:00.000Z' }), 'espn');
  applyEvent(ev({ id: 'm4', home: 'France', away: 'Spain', kickoff: '2027-06-06T19:00:00.000Z' }), 'espn');
  classifyFinals();

  const stages = db.prepare(`
    SELECT stage FROM matches WHERE group_name = 'KO' AND matchday = 9 ORDER BY kickoff_utc ASC
  `).all().map((r) => r.stage);
  assert.deepEqual(stages, ['semifinal', 'semifinal', 'third_place', 'final']);

  // admin picked France as champion beforehand
  const q = db.prepare("SELECT * FROM bonus_questions WHERE question_key = 'champion'").get();
  assert.equal(q.points, 10);
  const fra = db.prepare("SELECT id FROM teams WHERE code = 'FRA'").get().id;
  db.prepare('INSERT INTO bonus_answers (user_id, question_id, answer_team_id) VALUES (?, ?, ?)').run(admin, q.id, fra);

  // final: France beats Spain on pens
  applyEvent(ev({
    id: 'm4', home: 'France', away: 'Spain', kickoff: '2027-06-06T19:00:00.000Z',
    status: 'finished', hs: 2, as: 2, winner: 'France',
  }), 'espn');
  resolveBonusQuestions();

  const resolved = db.prepare("SELECT * FROM bonus_questions WHERE question_key = 'champion'").get();
  assert.equal(resolved.resolved, 1);
  assert.equal(resolved.correct_team_id, fra);
  const pts = db.prepare('SELECT points FROM bonus_answers WHERE question_id = ?').get(q.id).points;
  assert.equal(pts, 10);
});

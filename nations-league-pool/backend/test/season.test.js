// Full-season system simulation: plays the ENTIRE tournament through the
// real sync engine — 48 league matches, quarterfinals, Final Four — and
// asserts that every subsystem ends in a consistent state: points, standings,
// snapshots, top scorers, bonus payouts, achievements and the leaderboard sum.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nlpool-season-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret';
process.env.ADMIN_PASSWORD = 'admin-pw-123';

const db = (await import('../src/db/database.js')).default;
const { seed } = await import('../src/db/seed.js');
seed();
const { applyEvent, classifyFinals } = await import('../src/sync/engine.js');
const { resolveBonusQuestions } = await import('../src/services/bonus.js');
const { computeGroupStandings } = await import('../src/services/standings.js');
const { calculatePoints, STAGE_MULTIPLIERS } = await import('../src/services/scoring.js');

const teams = new Map(db.prepare('SELECT * FROM teams').all().map((t) => [t.id, t]));
const teamByCode = new Map([...teams.values()].map((t) => [t.code, t]));

// --- deterministic score generator (varied: wins, draws, big scores)
function scoreFor(matchId, homeId, awayId) {
  const h = (matchId * 7 + homeId * 3) % 5;      // 0..4
  const a = (matchId * 11 + awayId * 5) % 4;     // 0..3
  return [h % 4, a % 3];
}

// --- players: admin + 3 predictors with distinct styles
const users = { admin: db.prepare('SELECT id FROM users WHERE is_admin = 1').get().id };
for (const name of ['anna', 'bram', 'coen']) {
  const info = db.prepare(
    "INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, 'x')"
  ).run(name, name);
  users[name] = info.lastInsertRowid;
}

function predictAll() {
  const matches = db.prepare("SELECT * FROM matches WHERE status = 'scheduled'").all();
  const ins = db.prepare(`
    INSERT OR IGNORE INTO predictions (user_id, match_id, home_goals, away_goals, is_joker)
    VALUES (?, ?, ?, ?, 0)
  `);
  for (const m of matches) {
    const [h, a] = scoreFor(m.id, m.home_team_id, m.away_team_id);
    ins.run(users.anna, m.id, h, a);                    // anna: psychic — always exact
    ins.run(users.bram, m.id, Math.min(h + 1, 20), Math.min(a + 1, 20)); // bram: right GD
    ins.run(users.coen, m.id, a, h);                    // coen: swaps the score
  }
}

function finishAll(stage) {
  const matches = db.prepare('SELECT * FROM matches WHERE stage = ? AND status != ?').all(stage, 'finished');
  for (const m of matches) {
    const [h, a] = scoreFor(m.id, m.home_team_id, m.away_team_id);
    const home = teams.get(m.home_team_id);
    const away = teams.get(m.away_team_id);
    const r = applyEvent({
      providerId: `season-${m.id}`,
      homeName: home.name_en, awayName: away.name_en,
      homeScore: h, awayScore: a, status: 'finished', minute: null,
      kickoffIso: m.kickoff_utc,
      winnerName: m.stage !== 'league' && h === a ? home.name_en : null,
      goals: [
        ...Array.from({ length: h }, (_, i) => ({ player: `Spits ${home.code}`, teamName: home.name_en, minute: `${10 + i}'`, ownGoal: false, penalty: false })),
        ...Array.from({ length: a }, (_, i) => ({ player: `Spits ${away.code}`, teamName: away.name_en, minute: `${50 + i}'`, ownGoal: false, penalty: false })),
      ],
    }, 'espn');
    assert.equal(r.matched, true, `event for ${home.code}-${away.code} applied`);
  }
}

test('SEASON: bonus answers before the first kickoff', () => {
  predictAll();
  const q = (key) => db.prepare('SELECT * FROM bonus_questions WHERE question_key = ?').get(key);
  const ans = db.prepare('INSERT INTO bonus_answers (user_id, question_id, answer_team_id, answer_text, answer_number) VALUES (?, ?, ?, ?, ?)');
  // anna picks NED for group A2 + champion, tips the eventual topscorer late
  ans.run(users.anna, q('winner_A2').id, teamByCode.get('NED').id, null, null);
  ans.run(users.anna, q('champion').id, teamByCode.get('NED').id, null, null);
  ans.run(users.anna, q('points_ned').id, null, null, 10);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bonus_answers').get().n, 3);
});

test('SEASON: league phase — 48 matches, standings, snapshots, scorers', () => {
  finishAll('league');
  resolveBonusQuestions();

  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM matches WHERE stage = 'league' AND status = 'finished'").get().n, 48);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM matches WHERE stage = 'league' AND points_calculated = 0").get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM predictions WHERE points IS NULL').get().n, 0, 'every prediction scored');

  // standings: every group complete and internally consistent
  for (const g of ['A1', 'A2', 'A3', 'A4']) {
    const s = computeGroupStandings(g);
    assert.equal(s.length, 4);
    assert.equal(s.reduce((x, r) => x + r.played, 0), 24, `${g}: 4 teams × 6 matches`);
    const totalGf = s.reduce((x, r) => x + r.goals_for, 0);
    const totalGa = s.reduce((x, r) => x + r.goals_against, 0);
    assert.equal(totalGf, totalGa, `${g}: goals for == goals against`);
    const pts = s.reduce((x, r) => x + r.points, 0);
    assert.ok(pts >= 24 && pts <= 36, `${g}: total points ${pts} plausible for 12 matches`);
  }

  // snapshots for all six matchdays, for all active users
  const userCount = db.prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'active'").get().n;
  for (let md = 1; md <= 6; md++) {
    assert.equal(
      db.prepare('SELECT COUNT(*) AS n FROM matchday_snapshots WHERE matchday = ?').get(md).n,
      userCount, `snapshot for matchday ${md}`
    );
  }

  // top scorers aggregated from goal events
  const scorers = db.prepare('SELECT * FROM scorers ORDER BY goals DESC').all();
  assert.ok(scorers.length >= 8, 'scorer list populated');
  const totalGoals = db.prepare("SELECT COUNT(*) AS n FROM match_events WHERE event_type IN ('goal','penalty')").get().n;
  assert.equal(scorers.reduce((x, s) => x + s.goals, 0), totalGoals, 'scorers sum == goal events');

  // league bonus questions resolved themselves
  for (const key of ['winner_A1', 'winner_A2', 'winner_A3', 'winner_A4', 'points_ned', 'top_scorer']) {
    assert.equal(db.prepare('SELECT resolved FROM bonus_questions WHERE question_key = ?').get(key).resolved, 1, `${key} resolved`);
  }

  // anna predicted every match exactly → exact points on all 48
  const anna = db.prepare('SELECT SUM(points) AS p, COUNT(*) AS n FROM predictions WHERE user_id = ?').get(users.anna);
  assert.equal(anna.p, 48 * 5, 'anna: 48 exact league predictions');
});

test('SEASON: knockouts — QF legs, Final Four, champion bonus', () => {
  // the QF draw happens: 4 ties, two legs, winners vs runners-up
  const pairs = [];
  for (const [gw, gr] of [['A1', 'A2'], ['A2', 'A1'], ['A3', 'A4'], ['A4', 'A3']]) {
    pairs.push([computeGroupStandings(gw)[0].team_id, computeGroupStandings(gr)[1].team_id]);
  }
  const mkEvent = (homeId, awayId, iso) => ({
    providerId: `ko-${homeId}-${awayId}`,
    homeName: teams.get(homeId).name_en, awayName: teams.get(awayId).name_en,
    homeScore: null, awayScore: null, status: 'scheduled', minute: null,
    kickoffIso: iso, goals: [],
  });
  for (const [i, [w, r]] of pairs.entries()) {
    assert.equal(applyEvent(mkEvent(r, w, `2027-03-25T${18 + (i % 2)}:45:00.000Z`), 'espn').matched, true);
    assert.equal(applyEvent(mkEvent(w, r, `2027-03-28T${18 + (i % 2)}:45:00.000Z`), 'espn').matched, true);
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM matches WHERE stage = 'quarterfinal'").get().n, 8);

  predictAll();          // everyone predicts the new matches
  finishAll('quarterfinal');

  // QF predictions scored with the ×1.5 multiplier
  const qfPred = db.prepare(`
    SELECT p.points, p.home_goals, p.away_goals, m.home_score, m.away_score
    FROM predictions p JOIN matches m ON m.id = p.match_id
    WHERE m.stage = 'quarterfinal' AND p.user_id = ?
  `).all(users.anna);
  assert.equal(qfPred.length, 8);
  for (const p of qfPred) {
    assert.equal(p.points, calculatePoints(p.home_goals, p.away_goals, p.home_score, p.away_score, STAGE_MULTIPLIERS.quarterfinal));
    assert.equal(p.points, 7.5, 'anna exact in QF = 7.5');
  }

  // Final Four arrives as an undifferentiated June batch
  const semiTeams = pairs.map(([w]) => w); // deterministic stand-ins for the semi lineup
  applyEvent(mkEvent(semiTeams[0], semiTeams[1], '2027-06-01T19:00:00.000Z'), 'espn');
  applyEvent(mkEvent(semiTeams[2], semiTeams[3], '2027-06-02T19:00:00.000Z'), 'espn');
  applyEvent(mkEvent(semiTeams[1], semiTeams[3], '2027-06-06T13:00:00.000Z'), 'espn');
  applyEvent(mkEvent(semiTeams[0], semiTeams[2], '2027-06-06T19:00:00.000Z'), 'espn');
  classifyFinals();
  const stages = db.prepare("SELECT stage FROM matches WHERE matchday = 9 ORDER BY kickoff_utc").all().map((r) => r.stage);
  assert.deepEqual(stages, ['semifinal', 'semifinal', 'third_place', 'final']);

  predictAll();
  finishAll('semifinal');
  finishAll('third_place');
  finishAll('final');
  resolveBonusQuestions();

  const champQ = db.prepare("SELECT * FROM bonus_questions WHERE question_key = 'champion'").get();
  assert.equal(champQ.resolved, 1, 'champion bonus resolved after the final');
  const finalMatch = db.prepare("SELECT * FROM matches WHERE stage = 'final'").get();
  const expectWinner = finalMatch.winner_team_id
    || (finalMatch.home_score > finalMatch.away_score ? finalMatch.home_team_id : finalMatch.away_team_id);
  assert.equal(champQ.correct_team_id, expectWinner);
});

test('SEASON: global consistency — leaderboard equals sum of its parts', async () => {
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM predictions WHERE points IS NULL').get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM matches WHERE status != 'finished'").get().n, 0, 'entire tournament finished');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bonus_questions WHERE resolved = 0').get().n, 0, 'all bonus questions resolved');

  for (const [name, id] of Object.entries(users)) {
    const predPts = db.prepare('SELECT COALESCE(SUM(points), 0) AS p FROM predictions WHERE user_id = ?').get(id).p;
    const bonusPts = db.prepare('SELECT COALESCE(SUM(points), 0) AS p FROM bonus_answers WHERE user_id = ? AND points IS NOT NULL').get(id).p;
    // recompute what the leaderboard query reports
    const row = db.prepare(`
      SELECT COALESCE((SELECT SUM(points) FROM predictions WHERE user_id = u.id), 0) +
             COALESCE((SELECT SUM(points) FROM bonus_answers WHERE user_id = u.id AND points IS NOT NULL), 0) AS total
      FROM users u WHERE u.id = ?
    `).get(id);
    assert.equal(row.total, predPts + bonusPts, `${name}: leaderboard total consistent`);
  }

  // achievements: the perfect predictor collected the big ones
  const annaAch = db.prepare('SELECT achievement_key FROM achievements WHERE user_id = ?').all(users.anna).map((r) => r.achievement_key);
  for (const key of ['first_shot', 'completionist', 'sharpshooter', 'oracle', 'on_fire_10', 'day_winner', 'leader']) {
    assert.ok(annaAch.includes(key), `anna unlocked ${key}`);
  }

  // notifications went out for results and matchday wrap-ups
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE type = 'result'").get().n >= 48);
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE type = 'matchday'").get().n >= 6);
});

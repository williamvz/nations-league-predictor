// Demo mode: the simulator produces full match details (stats, timeline,
// line-ups, commentary, recap) consistent with the simulated score.
import test from 'node:test';
import assert from 'node:assert/strict';
import { useTempDb } from './helpers.js';

useTempDb('nlpool-simdetails-');
process.env.DEMO_MODE = '1';
process.env.DEMO_MATCHDAY_MINUTES = '0.01';
process.env.SIM_MATCH_MINUTES = '0.001';

const db = (await import('../src/db/database.js')).default;
const { seed } = await import('../src/db/seed.js');
seed();
const { syncScores, getDetails } = await import('../src/sync/engine.js');
const { fetchSimulatedEvents } = await import('../src/sync/providers/simulator.js');
const { simulateDetails } = await import('../src/sync/providers/simDetails.js');

await new Promise((r) => setTimeout(r, 1500)); // let matchday 1 kick off and finish

test('finished simulated matches carry complete details', async () => {
  await syncScores();
  const finished = db.prepare("SELECT * FROM matches WHERE status = 'finished'").all();
  assert.ok(finished.length > 0, 'some matches finished');
  for (const m of finished) {
    const d = getDetails(m.id);
    assert.ok(d, `details for match ${m.id}`);
    assert.equal(d.provider, 'sim');
    // timeline goals == final score
    const goals = (side) => d.timeline.filter((e) => e.side === side && (e.kind === 'goal' || e.kind === 'penalty_goal')).length;
    assert.equal(goals('home'), m.home_score, 'home goals in timeline');
    assert.equal(goals('away'), m.away_score, 'away goals in timeline');
    // stats sane
    const poss = d.stats.find((s) => s.key === 'possessionPct');
    assert.equal(poss.home + poss.away, 100);
    const shots = d.stats.find((s) => s.key === 'totalShots');
    const onTarget = d.stats.find((s) => s.key === 'shotsOnTarget');
    assert.ok(shots.home >= onTarget.home && onTarget.home >= m.home_score);
    // line-ups: 11 starters each, three subs made and flagged
    for (const side of ['home', 'away']) {
      assert.equal(d.lineups[side].starters.length, 11);
      assert.equal(d.lineups[side].bench.filter((p) => p.subbedIn).length, 3);
      assert.equal(d.lineups[side].starters.filter((p) => p.subbedOut).length, 3);
    }
    assert.ok(d.commentary.length > 5);
    assert.ok(d.commentary[0].seq > d.commentary[d.commentary.length - 1].seq, 'newest first');
    assert.ok(d.article?.paragraphs.length >= 3, 'recap written');
    assert.ok(d.info.venue && d.info.referee);
  }
  const complete = db.prepare('SELECT MIN(complete) AS c FROM match_details d JOIN matches m ON m.id = d.match_id WHERE m.status = ?').get('finished').c;
  assert.equal(complete, 1);
});

test('simulated details are deterministic and grow with the clock', () => {
  const teams = new Map(db.prepare('SELECT * FROM teams').all().map((t) => [t.id, t]));
  const m = db.prepare('SELECT * FROM matches LIMIT 1').get();
  const home = teams.get(m.home_team_id);
  const away = teams.get(m.away_team_id);
  const goals = [{ minute: 20, player: 'A', side: 'home', penalty: false }, { minute: 70, player: 'B', side: 'away', penalty: true }];
  const mk = (simMinute) => {
    let a = 42;
    const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
    return simulateDetails({ match: m, home, away, goals, simMinute, homeScore: 1, awayScore: simMinute >= 70 ? 1 : 0, finished: simMinute >= 90, winnerName: null, rnd, players: {} });
  };
  const at30 = mk(30);
  const at30b = mk(30);
  const at80 = mk(80);
  assert.deepEqual(at30, at30b);
  assert.equal(at30.article, null, 'no recap while live');
  assert.equal(at30.status, 'live');
  assert.ok(!at30.timeline.some((e) => e.player === 'B'), 'future goal hidden');
  assert.ok(at80.timeline.some((e) => e.kind === 'penalty_goal' && e.player === 'B'));
  const shots = (d) => d.stats.find((s) => s.key === 'totalShots').home;
  assert.ok(shots(at80) >= shots(at30), 'stats accumulate');
  assert.ok(at80.timeline.some((e) => e.kind === 'period' && e.text === 'Halftime'));
  assert.equal(mk(95).status, 'finished');
});

test('events from the simulator include details for every live/finished match', () => {
  const events = fetchSimulatedEvents().filter((e) => e.status !== 'scheduled');
  assert.ok(events.length > 0);
  for (const e of events) assert.ok(e.details?.stats?.length, e.providerId);
});

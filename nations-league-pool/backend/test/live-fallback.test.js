// Regression for "live match, empty screen": the score arrived but no minute,
// scorers or details. Covers the scoreboard baseline, the /summary fallback,
// live goal storage and the TheSportsDB-doesn't-wipe-the-clock rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { useTempDb } from './helpers.js';

useTempDb('nlpool-livefb-');
const db = (await import('../src/db/database.js')).default;
const { seed } = await import('../src/db/seed.js');
seed();
const { applyEvent, syncMatchDetails, getDetails } = await import('../src/sync/engine.js');
const { parseScoreboardDetails, mergeDetails, liveMinute, isEmptyDetails } = await import('../src/sync/providers/espn.js');

// shape of an ESPN soccer scoreboard competition while live
const comp = {
  venue: { fullName: 'Johan Cruijff ArenA', address: { city: 'Amsterdam' } },
  attendance: 52000,
  competitors: [
    { homeAway: 'home', id: '449', team: { id: '449', displayName: 'Netherlands' }, score: '0',
      statistics: [{ name: 'possessionPct', displayValue: '58.2' }, { name: 'totalShots', displayValue: '7' }, { name: 'shotsOnTarget', displayValue: '2' }, { name: 'wonCorners', displayValue: '4' }] },
    { homeAway: 'away', id: '481', team: { id: '481', displayName: 'Germany' }, score: '1',
      statistics: [{ name: 'possessionPct', displayValue: '41.8' }, { name: 'totalShots', displayValue: '3' }, { name: 'shotsOnTarget', displayValue: '1' }, { name: 'wonCorners', displayValue: '1' }] },
  ],
  details: [
    { type: { text: 'Yellow Card' }, yellowCard: true, clock: { value: 900, displayValue: "15'" }, team: { id: '449' }, athletesInvolved: [{ displayName: 'Virgil van Dijk' }] },
    { type: { text: 'Goal' }, scoringPlay: true, clock: { value: 1680, displayValue: "28'" }, team: { id: '481' }, athletesInvolved: [{ displayName: 'Kai Havertz' }] },
  ],
};
const [home, away] = comp.competitors;

test('scoreboard baseline: stats, goal + card timeline, venue', () => {
  const d = parseScoreboardDetails(comp, home, away, 'live');
  assert.deepEqual(d.stats.find((s) => s.key === 'possessionPct'), { key: 'possessionPct', home: 58, away: 42 });
  assert.deepEqual(d.timeline.map((e) => [e.kind, e.minute, e.side, e.player]), [
    ['yellow_card', "15'", 'home', 'Virgil van Dijk'],
    ['goal', "28'", 'away', 'Kai Havertz'],
  ]);
  assert.equal(d.info.venue, 'Johan Cruijff ArenA');
  assert.equal(d.info.attendance, 52000);
  assert.equal(isEmptyDetails(d), false);
});

test('liveMinute falls back from displayClock to shortDetail / HT', () => {
  assert.equal(liveMinute({ status: { displayClock: "34'" } }), "34'");
  assert.equal(liveMinute({ status: { displayClock: "0'", type: { shortDetail: "45'+2'" } } }), "45'+2'");
  assert.equal(liveMinute({ status: { displayClock: '', type: { shortDetail: 'HT' } } }), 'HT');
  assert.equal(liveMinute({ status: { type: { description: 'Halftime' } } }), 'HT');
  assert.equal(liveMinute({}), null);
});

test('mergeDetails: summary wins, scoreboard fills the gaps', () => {
  const base = parseScoreboardDetails(comp, home, away, 'live');
  const summary = { status: 'live', stats: [], timeline: [], lineups: { home: { formation: '4-3-3', starters: [], bench: [] } }, commentary: [{ seq: 1, text: 'x' }], info: { venue: null, referee: 'Ref' }, article: null, h2h: [] };
  const m = mergeDetails(summary, base);
  assert.equal(m.stats.length, base.stats.length, 'stats from scoreboard');
  assert.equal(m.timeline.length, 2, 'timeline from scoreboard');
  assert.equal(m.lineups.home.formation, '4-3-3', 'lineups from summary');
  assert.equal(m.commentary.length, 1);
  assert.deepEqual([m.info.venue, m.info.referee], ['Johan Cruijff ArenA', 'Ref']);
  assert.equal(mergeDetails(null, base), base);
  assert.equal(mergeDetails(null, null), null);
});

const match = db.prepare(`
  SELECT m.* FROM matches m JOIN teams th ON th.id = m.home_team_id JOIN teams ta ON ta.id = m.away_team_id
  WHERE th.code = 'NED' AND ta.code = 'GER' AND m.stage = 'league'
`).get();
db.prepare("UPDATE matches SET kickoff_utc = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 minutes') WHERE id = ?").run(match.id);
const kickoffIso = db.prepare('SELECT kickoff_utc FROM matches WHERE id = ?').get(match.id).kickoff_utc;
const espnEvent = (over = {}) => ({
  providerId: '700123', homeName: 'Netherlands', awayName: 'Germany', homeScore: 0, awayScore: 1,
  status: 'live', minute: "31'", kickoffIso,
  goals: [{ player: 'Kai Havertz', teamName: 'Germany', minute: "28'", ownGoal: false, penalty: false }],
  details: parseScoreboardDetails(comp, home, away, 'live'),
  ...over,
});

test('live ESPN event: minute and scorers stored while the match is running', () => {
  assert.equal(applyEvent(espnEvent(), 'espn').matched, true);
  const m = db.prepare('SELECT * FROM matches WHERE id = ?').get(match.id);
  assert.equal(m.status, 'live');
  assert.equal(m.minute, "31'");
  const goals = db.prepare('SELECT player_name, minute FROM match_events WHERE match_id = ?').all(match.id);
  assert.deepEqual(goals, [{ player_name: 'Kai Havertz', minute: "28'" }]);
});

test('a disallowed goal disappears on the next update', () => {
  applyEvent(espnEvent({ goals: [{ player: 'Leroy Sané', teamName: 'Germany', minute: "33'", ownGoal: false, penalty: false }] }), 'espn');
  const goals = db.prepare('SELECT player_name FROM match_events WHERE match_id = ?').all(match.id).map((g) => g.player_name);
  assert.deepEqual(goals, ['Leroy Sané']);
});

test('TheSportsDB (no clock) does not wipe the ESPN minute', () => {
  applyEvent({ providerId: 'tsdb-1', homeName: 'Netherlands', awayName: 'Germany', homeScore: 0, awayScore: 1, status: 'live', minute: null, kickoffIso, goals: [] }, 'tsdb');
  const m = db.prepare('SELECT minute FROM matches WHERE id = ?').get(match.id);
  assert.equal(m.minute, "31'");
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM match_events WHERE match_id = ?').get(match.id).n, 1, 'goals kept');
});

test('/summary fails → scoreboard baseline is stored, failure recorded', async () => {
  const baseline = new Map([['700123', espnEvent().details]]);
  const r = await syncMatchDetails({ baseline, fetcher: async () => { throw new Error('ESPN 404'); } });
  assert.equal(r.failed, 1);
  const d = getDetails(match.id);
  assert.ok(d, 'details stored despite the failure');
  assert.equal(d.timeline.length, 2);
  assert.equal(d.stats.length, 4);
  assert.match(d.sync.summary, /fout: ESPN 404/);
  assert.equal(d.sync.scoreboard, true);
});

test('/summary empty → flagged "leeg", baseline still shown', async () => {
  const baseline = new Map([['700123', espnEvent().details]]);
  await syncMatchDetails({ baseline, fetcher: async () => ({ stats: [], timeline: [], lineups: {}, commentary: [], info: {}, article: null, h2h: [] }) });
  const d = getDetails(match.id);
  assert.equal(d.sync.summary, 'leeg');
  assert.equal(d.timeline.length, 2);
});

test('finished match whose summary keeps failing stops being refetched after the wait', async () => {
  db.prepare("UPDATE matches SET status = 'finished', kickoff_utc = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-9 hours') WHERE id = ?").run(match.id);
  await syncMatchDetails({ backfill: true, fetcher: async () => { throw new Error('down'); }, baseline: new Map([['700123', espnEvent().details]]) });
  assert.equal(db.prepare('SELECT complete FROM match_details WHERE match_id = ?').get(match.id).complete, 1);
});

test('ESPN refuses a date range (400) → falls back to one request per day', async () => {
  const { fetchEventsForDays, _resetRangeSupport } = await import('../src/sync/providers/espn.js');
  _resetRangeSupport();
  const calls = [];
  const fake = async (dates) => {
    calls.push(dates);
    if (dates.includes('-')) throw Object.assign(new Error('ESPN 400'), { status: 400 });
    return [{ providerId: `e-${dates}` }, { providerId: 'shared' }];
  };
  const evs = await fetchEventsForDays(['20260925', '20260924', '20260924'], fake);
  assert.deepEqual(calls, ['20260924-20260925', '20260924', '20260925']);
  assert.deepEqual(evs.map((e) => e.providerId).sort(), ['e-20260924', 'e-20260925', 'shared']);

  // remembered: the next poll skips the range attempt
  calls.length = 0;
  await fetchEventsForDays(['20260924', '20260925'], fake);
  assert.deepEqual(calls, ['20260924', '20260925']);

  // a single day never uses a range
  calls.length = 0;
  await fetchEventsForDays(['20260924'], fake);
  assert.deepEqual(calls, ['20260924']);
});

test('per-day fallback: one bad day is skipped, all bad days throw', async () => {
  const { fetchEventsForDays, _resetRangeSupport } = await import('../src/sync/providers/espn.js');
  _resetRangeSupport();
  const flaky = async (d) => {
    if (d.includes('-')) throw Object.assign(new Error('ESPN 400'), { status: 400 });
    if (d === '20260925') throw new Error('ESPN 500');
    return [{ providerId: d }];
  };
  assert.deepEqual((await fetchEventsForDays(['20260924', '20260925'], flaky)).map((e) => e.providerId), ['20260924']);
  const down = async () => { throw Object.assign(new Error('ESPN 400'), { status: 400 }); };
  _resetRangeSupport();
  await assert.rejects(fetchEventsForDays(['20260924', '20260925'], down), /ESPN 400/);
  // non-400 range errors are real errors, not a reason to fan out
  _resetRangeSupport();
  const boom = async () => { throw Object.assign(new Error('ESPN 503'), { status: 503 }); };
  await assert.rejects(fetchEventsForDays(['20260924', '20260925'], boom), /ESPN 503/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { TEAMS, MATCHES, MATCHDAYS } from '../src/db/tournamentData.js';

test('16 teams in 4 groups of 4', () => {
  assert.equal(TEAMS.length, 16);
  for (const g of ['A1', 'A2', 'A3', 'A4']) {
    assert.equal(TEAMS.filter((t) => t.group === g).length, 4, `group ${g}`);
  }
});

test('48 matches: full double round-robin per group', () => {
  assert.equal(MATCHES.length, 48);
  const byCode = Object.fromEntries(TEAMS.map((t) => [t.code, t]));
  for (const m of MATCHES) {
    assert.equal(byCode[m.home].group, byCode[m.away].group, `${m.home}-${m.away} same group`);
  }
  // each ordered pairing exactly once (home & away)
  const seen = new Set();
  for (const m of MATCHES) {
    const key = `${m.home}-${m.away}`;
    assert.ok(!seen.has(key), `duplicate fixture ${key}`);
    seen.add(key);
  }
  // every team: 6 matches, 3 home, 3 away
  for (const t of TEAMS) {
    const home = MATCHES.filter((m) => m.home === t.code).length;
    const away = MATCHES.filter((m) => m.away === t.code).length;
    assert.equal(home, 3, `${t.code} home`);
    assert.equal(away, 3, `${t.code} away`);
  }
});

test('each team plays exactly once per matchday', () => {
  for (let md = 1; md <= 6; md++) {
    const played = MATCHES.filter((m) => m.matchday === md).flatMap((m) => [m.home, m.away]);
    assert.equal(played.length, 16, `matchday ${md} match count`);
    assert.equal(new Set(played).size, 16, `matchday ${md} unique teams`);
  }
});

test('match dates fall inside their matchday window', () => {
  for (const m of MATCHES) {
    const w = MATCHDAYS.find((x) => x.number === m.matchday);
    assert.ok(m.date >= w.start && m.date <= w.end, `${m.home}-${m.away} on ${m.date} outside MD${m.matchday}`);
  }
});

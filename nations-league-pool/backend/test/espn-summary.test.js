// ESPN /summary parser: pinned against a realistic fixture, plus robustness
// against the partial payloads ESPN serves for smaller matches.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseSummary, htmlToParagraphs, classifyEvent, STAT_KEYS } from '../src/sync/providers/espn.js';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/espn-summary.json', import.meta.url)));
const d = parseSummary(fixture);

test('status and statistics', () => {
  assert.equal(d.status, 'finished');
  const byKey = Object.fromEntries(d.stats.map((s) => [s.key, s]));
  assert.deepEqual(byKey.possessionPct, { key: 'possessionPct', home: 54, away: 46 });
  assert.deepEqual(byKey.passPct, { key: 'passPct', home: 84, away: 81 }, 'fraction → percent');
  assert.equal(byKey.redCards.away, 1);
  assert.ok(!('someUnknownStat' in byKey), 'unknown stats are dropped');
  // display order follows STAT_KEYS
  const order = d.stats.map((s) => STAT_KEYS.indexOf(s.key));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test('timeline: goals, assists, cards, subs, periods', () => {
  const kinds = d.timeline.map((e) => e.kind);
  assert.deepEqual(kinds, ['period', 'goal', 'yellow_card', 'period', 'penalty_goal', 'substitution', 'red_card', 'goal', 'period']);
  const gakpo = d.timeline.find((e) => e.player === 'Cody Gakpo');
  assert.equal(gakpo.side, 'home');
  assert.equal(gakpo.related, 'Xavi Simons');
  assert.equal(gakpo.minute, "23'");
  const sub = d.timeline.find((e) => e.kind === 'substitution');
  assert.equal(sub.player, 'Wout Weghorst', 'player coming on');
  assert.equal(sub.related, 'Memphis Depay', 'player going off');
  const pen = d.timeline.find((e) => e.kind === 'penalty_goal');
  assert.equal(pen.side, 'away');
  assert.equal(pen.related, null);
  assert.equal(d.timeline.find((e) => e.player === 'Wout Weghorst' && e.kind === 'goal').related, null, 'unassisted');
});

test('line-ups with formation, ordering and sub flags', () => {
  assert.equal(d.lineups.home.formation, '4-3-3');
  assert.equal(d.lineups.away.formation, '4-2-3-1');
  assert.deepEqual(d.lineups.home.starters.map((p) => p.name), ['Bart Verbruggen', 'Virgil van Dijk', 'Memphis Depay']);
  assert.equal(d.lineups.home.starters[2].subbedOut, true);
  assert.equal(d.lineups.home.bench[0].subbedIn, true);
});

test('commentary newest first, empty lines dropped', () => {
  assert.deepEqual(d.commentary.map((c) => c.seq), [90, 30, 2, 1]);
  assert.equal(d.commentary[1].kind, 'goal');
});

test('game info picks the referee, not an assistant', () => {
  assert.deepEqual(d.info, { venue: 'Johan Cruijff ArenA', city: 'Amsterdam, Netherlands', attendance: 54033, referee: 'Clément Turpin' });
});

test('article: HTML → safe plain paragraphs', () => {
  assert.equal(d.article.headline, 'Weghorst late show sinks ten-man Germany');
  assert.deepEqual(d.article.paragraphs, [
    'AMSTERDAM — Wout Weghorst came off the bench to head a late winner.',
    'Cody Gakpo had opened the scoring & Kai Havertz levelled from the spot.',
    "Germany's night got worse when Rüdiger saw red.",
  ]);
  assert.ok(!d.article.paragraphs.join(' ').includes('alert'), 'script content stripped');
  assert.match(d.article.url, /^https:\/\/www\.espn\.com\//);
});

test('head-to-head from this match\'s home perspective', () => {
  assert.equal(d.h2h.length, 2);
  // GER 1-0 NED away → shown as NED 0-1 GER
  assert.deepEqual([d.h2h[0].homeScore, d.h2h[0].awayScore, d.h2h[0].venueSwapped], [0, 1, true]);
  assert.deepEqual([d.h2h[1].homeScore, d.h2h[1].awayScore], [2, 2]);
});

test('robust against empty and partial payloads', () => {
  for (const payload of [null, {}, { header: {} }, { boxscore: { teams: [{}] }, keyEvents: [{}], rosters: [{}], commentary: [{}], gameInfo: { officials: [{}] } }]) {
    const r = parseSummary(payload);
    assert.deepEqual(r.stats, []);
    assert.deepEqual(r.timeline, []);
    assert.deepEqual(r.lineups, {});
    assert.deepEqual(r.commentary, []);
    assert.equal(r.article, null);
    assert.deepEqual(r.h2h, []);
  }
  // live match before any stats: commentary only
  const live = parseSummary({
    header: { competitions: [{ status: { type: { state: 'in' } }, competitors: [] }] },
    commentary: [{ sequence: 3, time: { displayValue: "2'" }, text: 'Early pressure.' }],
  });
  assert.equal(live.status, 'live');
  assert.equal(live.commentary.length, 1);
});

test('news article fallback when there is no top-level article', () => {
  const r = parseSummary({ news: { articles: [{ type: 'Recap', headline: 'Recap!', story: 'One.<br>Two.' }] } });
  assert.deepEqual(r.article.paragraphs, ['One.', 'Two.']);
});

test('classifyEvent vocabulary', () => {
  assert.equal(classifyEvent('Goal', '', true), 'goal');
  assert.equal(classifyEvent('Goal - Header', 'Goal!', true), 'goal');
  assert.equal(classifyEvent('Penalty - Scored', '', true), 'penalty_goal');
  assert.equal(classifyEvent('Own Goal', '', true), 'own_goal');
  assert.equal(classifyEvent('Penalty - Missed', 'saved by the keeper'), 'penalty_missed');
  assert.equal(classifyEvent('Yellow Card', ''), 'yellow_card');
  assert.equal(classifyEvent('Second Yellow Card', ''), 'red_card');
  assert.equal(classifyEvent('Substitution', ''), 'substitution');
  assert.equal(classifyEvent('VAR Decision', ''), 'var');
  assert.equal(classifyEvent('Halftime', ''), 'period');
  assert.equal(classifyEvent('Shootout', '', true), 'shootout');
  assert.equal(classifyEvent('Throw In', ''), null);
});

test('htmlToParagraphs', () => {
  assert.deepEqual(htmlToParagraphs('<p>A &amp; B</p><p>&eacute;&ccedil;&#8364;&#x41;</p>'), ['A & B', 'éç€A']);
  assert.deepEqual(htmlToParagraphs('<style>p{}</style><p>x y</p>'), ['x y']);
  assert.deepEqual(htmlToParagraphs(''), []);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { actingSide, namesFor, estimateTime } from './commentaryTeam.js';

const CASES = [
  // NED (home) – GER (away), ESPN English
  ['Corner, Netherlands. Conceded by Nico Schlotterbeck.', 'home'],
  ['Corner, Germany. Conceded by Virgil van Dijk.', 'away'],
  ['Offside, Netherlands. Denzel Dumfries is caught offside.', 'home'],
  ['Substitution, Germany. Leroy Sané replaces Serge Gnabry.', 'away'],
  ['Penalty Germany. Kai Havertz draws a foul in the penalty area.', 'away'],
  ['Goal! Netherlands 0, Germany 1. Kai Havertz (Germany) converts the penalty.', 'away'],
  ['Goal! Netherlands 1, Germany 1. Cody Gakpo (Netherlands) right footed shot.', 'home'],
  ['Attempt saved. Ruben van Bommel (Netherlands) right footed shot is saved by Marc ter Stegen (Germany).', 'home'],
  ['Foul by Jonathan Tah (Germany).', 'away'],
  ['Own Goal by Nico Schlotterbeck, Germany. Netherlands 2, Germany 1.', 'away'],
  ['Delay in match because of an injury Yannik Engelhardt (Germany).', 'away'],
  // demo Dutch
  ['Wissel bij Nederland: Sem Dekker komt in het veld voor Wout Weghorst.', 'home'],
  ['Hoekschop voor Duitsland, maar de kopbal gaat over.', 'away'],
  ['Gele kaart voor Levi Meijer (Nederland) na een late tackle.', 'home'],
  ['GOAL! Kai Havertz benut de strafschop koelbloedig voor Duitsland.', 'away'],
  ['Buitenspel. De vlag van de assistent gaat omhoog tegen Nederland.', 'home'],
  ['Nederland zet druk op de opbouw van de tegenstander.', 'home'],
  ['Mooie combinatie van Duitsland over rechts, de voorzet wordt weggewerkt.', 'away'],
  // translated Dutch ESPN lines work too
  ['Hoekschop voor Nederland. Veroorzaakt door Nico Schlotterbeck.', 'home'],
  // nobody in particular
  ['Delay over. They are ready to continue.', null],
  ['First Half begins.', null],
];

for (const [text, want] of CASES) {
  test(`${want ?? 'none'}: ${text.slice(0, 50)}`, () => assert.equal(actingSide(text, 'NED', 'GER'), want));
}

test('names with diacritics and aliases (Servië, Türkiye/Turkey, Czech Republic)', () => {
  assert.equal(actingSide('Wissel bij Servië: X komt erin.', 'SRB', 'GRE'), 'home');
  assert.equal(actingSide('Corner, Turkey. Conceded by X.', 'ITA', 'TUR'), 'away');
  assert.equal(actingSide('Foul by X (Türkiye).', 'ITA', 'TUR'), 'away');
  assert.equal(actingSide('Offside, Czech Republic. X is caught offside.', 'CZE', 'ESP'), 'home');
  assert.equal(actingSide('Hoekschop voor Italië, maar de kopbal gaat over.', 'ITA', 'TUR'), 'home');
  assert.ok(namesFor('NED').includes('Netherlands') && namesFor('NED').includes('Nederland') && namesFor('NED').includes('Holland'));
});

test('a team that is not in this match is ignored', () => {
  assert.equal(actingSide('Foul by X (Spain).', 'NED', 'GER'), null);
});

test('estimateTime orders minutes across halves and stoppage time', () => {
  const k = '2026-09-24T18:45:00Z';
  const t = (m) => estimateTime(k, m);
  assert.ok(t("44'") < t("45'+2'") && t("45'+2'") < t("46'") && t("46'") < t("90'+4'"));
  assert.equal(t('HT'), null);
  assert.equal(t(null), null);
});

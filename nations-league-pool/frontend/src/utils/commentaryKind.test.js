import test from 'node:test';
import assert from 'node:assert/strict';
import { commentaryKind, HEADLINE_KINDS } from './commentaryKind.js';

const CASES = [
  // ESPN (English originals)
  ['Goal! Netherlands 1, Germany 1. Cody Gakpo (Netherlands) right footed shot from the centre of the box to the bottom right corner.', 'goal'],
  ['Goal! Netherlands 1, Germany 1. Kai Havertz (Germany) converts the penalty with a right footed shot to the bottom left corner.', 'penalty_goal'],
  ['Own Goal by Nico Schlotterbeck, Germany. Netherlands 2, Germany 1.', 'own_goal'],
  ['Penalty saved! Memphis Depay (Netherlands) fails to capitalise on this great opportunity, right footed shot saved in the bottom left corner.', 'penalty_missed'],
  ['Penalty missed! Bad penalty by Harry Kane (England) right footed shot misses to the left.', 'penalty_missed'],
  ['Dusan Tadic (Serbia) is shown the yellow card for a bad foul.', 'yellow_card'],
  ['Antonio Rüdiger (Germany) is shown the red card.', 'red_card'],
  ['Second yellow card to Antonio Rüdiger (Germany) for a bad foul.', 'red_card'],
  ['Substitution, Serbia. Dejan Joveljic replaces Luka Jovic.', 'substitution'],
  ['VAR Decision: No Goal Netherlands.', 'var'],
  ['Attempt saved. Ruben van Bommel (Netherlands) right footed shot from outside the box is saved in the bottom right corner.', 'save'],
  ['Attempt missed. Guus Til (Netherlands) header from the centre of the box is close, but misses to the left.', 'chance'],
  ['Attempt blocked. Ruben van Bommel (Netherlands) right footed shot from outside the box is blocked.', 'chance'],
  ['Christos Tzolis (Greece) hits the left post with a right footed shot from outside the box.', 'woodwork'],
  ['Corner, Netherlands. Conceded by Nico Schlotterbeck.', 'corner'],
  ['Offside, Netherlands. Denzel Dumfries is caught offside.', 'offside'],
  ['Penalty conceded by Virgil van Dijk (Netherlands) after a foul in the penalty area.', 'penalty_awarded'],
  ['Penalty Germany. Kai Havertz draws a foul in the penalty area.', 'penalty_awarded'],
  ['Delay in match because of an injury Yannik Engelhardt (Germany).', 'injury'],
  ['Fourth official has announced 3 minutes of added time.', 'added_time'],
  ['First Half begins.', 'period'],
  ['Second Half ends, Netherlands 1, Germany 1.', 'period'],
  ['Match ends, Netherlands 1, Germany 1.', 'period'],
  ['Foul by Jonathan Tah (Germany).', null],
  ['Mexx Meerdink (Netherlands) wins a free kick in the attacking half.', null],
  ['Delay over. They are ready to continue.', null],
  // demo (Dutch)
  ['GOAL! Nederland scoort! Memphis Depay maakt hem af.', 'goal'],
  ['GOAL! Cody Gakpo benut de strafschop koelbloedig voor Nederland.', 'penalty_goal'],
  ['Gele kaart voor Levi Meijer (Nederland) na een late tackle.', 'yellow_card'],
  ['ROOD! Joris Kok (Nederland) moet eruit.', 'red_card'],
  ['Wissel bij Duitsland: Luca Visser komt in het veld voor Niclas Füllkrug.', 'substitution'],
  ['VAR-check… na een lange blik op de beelden blijft de beslissing staan.', 'var'],
  ['Hoekschop voor Duitsland, maar de kopbal gaat over.', 'corner'],
  ['Buitenspel. De vlag van de assistent gaat omhoog tegen Nederland.', 'offside'],
  ['Aftrap! Nederland tegen Duitsland is begonnen.', 'period'],
  ['Rust. De spelers zoeken de kleedkamer op.', 'period'],
  ['Einde wedstrijd: Nederland 3–2 Duitsland.', 'period'],
];

for (const [text, want] of CASES) {
  test(`${want ?? 'none'}: ${text.slice(0, 50)}`, () => assert.equal(commentaryKind(text), want));
}

test('backend kind is the fallback for unrecognised text', () => {
  assert.equal(commentaryKind('Something new.', 'goal'), 'goal');
  assert.equal(commentaryKind('Something new.'), null);
});

test('period and added time render as headlines', () => {
  assert.ok(HEADLINE_KINDS.has('period') && HEADLINE_KINDS.has('added_time'));
  assert.ok(!HEADLINE_KINDS.has('goal'));
});

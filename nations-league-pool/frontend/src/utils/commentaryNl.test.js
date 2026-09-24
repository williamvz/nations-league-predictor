// node --test: Dutch translation of ESPN commentary. The English lines are
// real ESPN/Opta output (several copied from the NED–GER match of 24 Sept 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { commentaryToDutch } from './commentaryNl.js';

const nl = (s) => commentaryToDutch(s).text;

const CASES = [
  ['Match ends, Netherlands 1, Germany 1.', 'Einde wedstrijd, Nederland 1, Duitsland 1.'],
  ['Second Half ends, Netherlands 1, Germany 1.', 'Einde van de tweede helft, Nederland 1, Duitsland 1.'],
  ['First Half ends, Serbia 1, Greece 0.', 'Rust, Servië 1, Griekenland 0.'],
  ['First Half begins.', 'De eerste helft is begonnen.'],
  ['Second Half begins Serbia 1, Greece 0.', 'De tweede helft is begonnen, Servië 1, Griekenland 0.'],
  ['Lineups are announced and players are warming up.', 'De opstellingen zijn bekend en de spelers warmen op.'],
  ['Attempt missed. Guus Til (Netherlands) header from the centre of the box is close, but misses to the left. Assisted by Joey Veerman with a cross.',
    'Gemiste kans. Guus Til (Nederland) kopbal vanuit het midden van het strafschopgebied gaat net links naast. Aangegeven door Joey Veerman met een voorzet.'],
  ['Delay over. They are ready to continue.', 'Het oponthoud is voorbij, er wordt weer gevoetbald.'],
  ['Delay in match because of an injury Yannik Engelhardt (Germany).', 'Oponthoud vanwege een blessure bij Yannik Engelhardt (Duitsland).'],
  ['Goal! Netherlands 1, Germany 1. Cody Gakpo (Netherlands) right footed shot from the centre of the box to the bottom right corner. Assisted by Ruben van Bommel with a cross.',
    'GOAL! Nederland 1, Duitsland 1. Cody Gakpo (Nederland) schot met rechts vanuit het midden van het strafschopgebied in de rechteronderhoek. Aangegeven door Ruben van Bommel met een voorzet.'],
  ['Fourth official has announced 3 minutes of added time.', 'De vierde official geeft 3 minuten blessuretijd aan.'],
  ['Offside, Netherlands. Denzel Dumfries is caught offside.', 'Buitenspel, Nederland. Denzel Dumfries staat buitenspel.'],
  ['Offside, Germany. Joshua Kimmich tries a through ball, but Kai Havertz is caught offside.', 'Buitenspel, Duitsland. Joshua Kimmich probeert een steekpass, maar Kai Havertz staat buitenspel.'],
  ['Mexx Meerdink (Netherlands) wins a free kick in the attacking half.', 'Mexx Meerdink (Nederland) versiert een vrije trap op de helft van de tegenstander.'],
  ['Foul by Jonathan Tah (Germany).', 'Overtreding van Jonathan Tah (Duitsland).'],
  ['Attempt saved. Ruben van Bommel (Netherlands) right footed shot from outside the box is saved in the bottom right corner by Marc ter Stegen (Germany).',
    'Schot gered. Ruben van Bommel (Nederland) schot met rechts van buiten het strafschopgebied wordt gered in de rechteronderhoek door Marc ter Stegen (Duitsland).'],
  ['Corner, Netherlands. Conceded by Nico Schlotterbeck.', 'Hoekschop voor Nederland. Veroorzaakt door Nico Schlotterbeck.'],
  ['Attempt blocked. Ruben van Bommel (Netherlands) right footed shot from outside the box is blocked.',
    'Schot geblokt. Ruben van Bommel (Nederland) schot met rechts van buiten het strafschopgebied wordt geblokt.'],
  ['Dusan Tadic (Serbia) is shown the yellow card for a bad foul.', 'Gele kaart voor Dusan Tadic (Servië) na een harde overtreding.'],
  ['Antonio Rüdiger (Germany) is shown the red card.', 'Rode kaart voor Antonio Rüdiger (Duitsland).'],
  ['Second yellow card to Antonio Rüdiger (Germany) for a bad foul.', 'Tweede gele kaart voor Antonio Rüdiger (Duitsland) na een harde overtreding.'],
  ['Substitution, Serbia. Dejan Joveljic replaces Luka Jovic.', 'Wissel bij Servië. Dejan Joveljic komt in de plaats van Luka Jovic.'],
  ['Substitution, Greece. Giannis Michailidis replaces Konstantinos Mavropanos because of an injury.', 'Wissel bij Griekenland. Giannis Michailidis vervangt de geblesseerde Konstantinos Mavropanos.'],
  ['Hand ball by Kai Havertz (Germany).', 'Hands van Kai Havertz (Duitsland).'],
  ['Penalty conceded by Virgil van Dijk (Netherlands) after a foul in the penalty area.', 'Strafschop veroorzaakt door Virgil van Dijk (Nederland) na een overtreding in het strafschopgebied.'],
  ['Penalty Germany. Kai Havertz draws a foul in the penalty area.', 'Strafschop voor Duitsland. Kai Havertz wordt neergehaald in het strafschopgebied.'],
  ['Christos Tzolis (Greece) hits the left post with a right footed shot from outside the box.', 'Christos Tzolis (Griekenland) raakt de linkerpaal met een schot met rechts van buiten het strafschopgebied.'],
  ['Attempt missed. Luka Jovic (Serbia) left footed shot from the left side of the box is too high.', 'Gemiste kans. Luka Jovic (Servië) schot met links vanaf de linkerkant van het strafschopgebied gaat over.'],
  ['Attempt missed. Kai Havertz (Germany) header from the centre of the box is close, but misses the top right corner following a corner.',
    'Gemiste kans. Kai Havertz (Duitsland) kopbal vanuit het midden van het strafschopgebied scheert net langs de rechterbovenhoek na een hoekschop.'],
  ['Own Goal by Nico Schlotterbeck, Germany. Netherlands 2, Germany 1.', 'Eigen doelpunt van Nico Schlotterbeck (Duitsland). Nederland 2, Duitsland 1.'],
  ['VAR Decision: No Goal Netherlands.', 'VAR-beslissing: geen doelpunt Nederland.'],
];

for (const [en, want] of CASES) {
  test(en.slice(0, 60), () => {
    const r = commentaryToDutch(en);
    assert.equal(r.text, want);
    assert.equal(r.translated, true);
  });
}

test('unknown sentences stay English and are flagged untranslated', () => {
  const r = commentaryToDutch('Something entirely new happened.');
  assert.deepEqual(r, { text: 'Something entirely new happened.', translated: false });
});

test('already-Dutch demo commentary passes through untouched', () => {
  const s = 'Hoekschop voor Nederland, maar de kopbal gaat over.';
  assert.equal(nl(s), s);
});

test('empty input', () => {
  assert.deepEqual(commentaryToDutch(''), { text: '', translated: false });
  assert.deepEqual(commentaryToDutch(null), { text: '', translated: false });
});

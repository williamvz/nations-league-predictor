// Dutch translation of ESPN's live commentary. That text is machine-written
// from a fixed set of English sentence templates ("Attempt saved. X (Team)
// right footed shot from outside the box is saved in the bottom right
// corner."), so ordered pattern rules translate it reliably, with no external
// service. Anything not recognised stays English; the UI can always show the
// original. Plain JS (no React) so it runs under node:test too.

// team names as ESPN writes them → Dutch
const TEAMS = {
  France: 'Frankrijk', Italy: 'Italië', Belgium: 'België', 'Türkiye': 'Turkije', Turkey: 'Turkije', Germany: 'Duitsland',
  Netherlands: 'Nederland', Holland: 'Nederland', Serbia: 'Servië', Greece: 'Griekenland', Spain: 'Spanje', Croatia: 'Kroatië',
  England: 'Engeland', 'Czech Republic': 'Tsjechië', Czechia: 'Tsjechië', Portugal: 'Portugal', Denmark: 'Denemarken',
  Norway: 'Noorwegen', Wales: 'Wales', Scotland: 'Schotland', Ireland: 'Ierland', 'Republic of Ireland': 'Ierland',
  'Northern Ireland': 'Noord-Ierland', Switzerland: 'Zwitserland', Austria: 'Oostenrijk', Poland: 'Polen',
  Hungary: 'Hongarije', Sweden: 'Zweden', Ukraine: 'Oekraïne', Slovenia: 'Slovenië', Slovakia: 'Slowakije',
  Romania: 'Roemenië', Georgia: 'Georgië', Iceland: 'IJsland', Albania: 'Albanië', Bosnia: 'Bosnië',
  'Bosnia and Herzegovina': 'Bosnië en Herzegovina', Finland: 'Finland', Israel: 'Israël', Kosovo: 'Kosovo',
};

// Name/team placeholders: names never contain "(" or ")"; a team is
// whatever sits between the parentheses.
const N = "([^()]+?)"; // player name (lazy)
const T = '([^()]+)';  // team inside parentheses

/** [pattern, replacement] in order: whole-sentence templates first, then phrases. */
const RULES = [
  // --- match flow ---------------------------------------------------------
  [/^Lineups are announced and players are warming up\.?$/, 'De opstellingen zijn bekend en de spelers warmen op.'],
  [/^First Half begins\.?$/, 'De eerste helft is begonnen.'],
  [/^Second Half begins (.+)\.$/, 'De tweede helft is begonnen, $1.'],
  [/^First Half ends, (.+)\.$/, 'Rust, $1.'],
  [/^Second Half ends, (.+)\.$/, 'Einde van de tweede helft, $1.'],
  [/^First Half Extra Time begins (.+)\.$/, 'De eerste helft van de verlenging is begonnen, $1.'],
  [/^First Half Extra Time ends, (.+)\.$/, 'Einde eerste helft verlenging, $1.'],
  [/^Second Half Extra Time begins (.+)\.$/, 'De tweede helft van de verlenging is begonnen, $1.'],
  [/^Second Half Extra Time ends, (.+)\.$/, 'Einde verlenging, $1.'],
  [/^Penalty Shootout begins (.+)\.$/, 'De strafschoppenserie begint, $1.'],
  [/^Penalty Shootout ends, (.+)\.$/, 'Einde strafschoppenserie, $1.'],
  [/^Match ends, (.+)\.$/, 'Einde wedstrijd, $1.'],
  [/^Delay over\. They are ready to continue\.?$/, 'Het oponthoud is voorbij, er wordt weer gevoetbald.'],
  [new RegExp(`^Delay in match because of an injury ${N} \\(${T}\\)\\.$`), 'Oponthoud vanwege een blessure bij $1 ($2).'],
  [/^Delay in match\s*\.?$/, 'Oponthoud.'],
  [/^Fourth official has announced (\d+) minutes? of added time\.$/, 'De vierde official geeft $1 minuten blessuretijd aan.'],
  [/^Drinks break\.?$/, 'Drinkpauze.'],

  // --- goals ----------------------------------------------------------------
  [/^Goal! /, 'GOAL! '],
  [new RegExp(`Own Goal by ${N}, ${T}\\. `), 'Eigen doelpunt van $1 ($2). '],
  [/^Penalty saved! /, 'Strafschop gestopt! '],
  [/^Penalty missed! /, 'Strafschop gemist! '],
  [new RegExp(`Bad penalty by ${N} \\(${T}\\) `), 'Slechte strafschop van $1 ($2): '],
  [new RegExp(`${N} \\(${T}\\) fails to capitalise on this great opportunity, `), '$1 ($2) laat deze kans liggen: '],
  [new RegExp(`${N} \\(${T}\\) converts the penalty with a `), '$1 ($2) benut de strafschop met een '],

  // --- attempts -------------------------------------------------------------
  [/^Attempt missed\. /, 'Gemiste kans. '],
  [/^Attempt saved\. /, 'Schot gered. '],
  [/^Attempt blocked\. /, 'Schot geblokt. '],
  [/^Big chance missed\. /, 'Grote kans gemist. '],
  [new RegExp(`${N} \\(${T}\\) hits the (left|right) post with a `), (m, p, t, s) => `${p} (${t}) raakt de ${s === 'left' ? 'linker' : 'rechter'}paal met een `],
  [new RegExp(`${N} \\(${T}\\) hits the bar with a `), '$1 ($2) raakt de lat met een '],

  // --- fouls, free kicks, set pieces -----------------------------------------
  [new RegExp(`^Foul by ${N} \\(${T}\\)\\.$`), 'Overtreding van $1 ($2).'],
  [new RegExp(`^Hand ball by ${N} \\(${T}\\)\\.$`), 'Hands van $1 ($2).'],
  [new RegExp(`^Dangerous play by ${N} \\(${T}\\)\\.$`), 'Gevaarlijk spel van $1 ($2).'],
  [new RegExp(`^${N} \\(${T}\\) wins a free kick (.+)\\.$`), (m, p, t, where) => `${p} (${t}) versiert een vrije trap ${place(where)}.`],
  [new RegExp(`^${N} \\(${T}\\) is shown the (yellow|red) card(.*)\\.$`), (m, p, t, c, why) => `${c === 'yellow' ? 'Gele' : 'Rode'} kaart voor ${p} (${t})${reason(why)}.`],
  [new RegExp(`^Second yellow card to ${N} \\(${T}\\)(.*)\\.$`), (m, p, t, why) => `Tweede gele kaart voor ${p} (${t})${reason(why)}.`],
  [new RegExp(`^Penalty conceded by ${N} \\(${T}\\) after a foul in the penalty area\\.$`), 'Strafschop veroorzaakt door $1 ($2) na een overtreding in het strafschopgebied.'],
  [new RegExp(`^Penalty conceded by ${N} \\(${T}\\) with a hand ball in the penalty area\\.$`), 'Strafschop veroorzaakt door $1 ($2) na hands in het strafschopgebied.'],
  [new RegExp(`^Penalty ${T}\\. ${N} draws a foul in the penalty area\\.$`), 'Strafschop voor $1. $2 wordt neergehaald in het strafschopgebied.'],
  [new RegExp(`^Corner, ${T}\\. Conceded by ${N}\\.$`), 'Hoekschop voor $1. Veroorzaakt door $2.'],
  [new RegExp(`^Offside, ${T}\\. ${N} tries a through ball, but ${N} is caught offside\\.$`), 'Buitenspel, $1. $2 probeert een steekpass, maar $3 staat buitenspel.'],
  [new RegExp(`^Offside, ${T}\\. ${N} is caught offside\\.$`), 'Buitenspel, $1. $2 staat buitenspel.'],

  // --- substitutions / VAR ----------------------------------------------------
  [new RegExp(`^Substitution, ${T}\\. ${N} replaces ${N} because of an injury\\.$`), 'Wissel bij $1. $2 vervangt de geblesseerde $3.'],
  [new RegExp(`^Substitution, ${T}\\. ${N} replaces ${N}\\.$`), 'Wissel bij $1. $2 komt in de plaats van $3.'],
  [/^VAR Decision: (.+)\.?$/, (m, rest) => `VAR-beslissing: ${varText(rest)}`],

  // --- shot descriptors (inside the attempt/goal sentences) --------------------
  [/\bright footed shot\b/g, 'schot met rechts'],
  [/\bleft footed shot\b/g, 'schot met links'],
  [/\bheader\b/g, 'kopbal'],
  [/\bfrom very close range\b/g, 'van heel dichtbij'],
  [/\bfrom the centre of the box\b/g, 'vanuit het midden van het strafschopgebied'],
  [/\bfrom outside the box\b/g, 'van buiten het strafschopgebied'],
  [/\bfrom the (left|right) side of the six yard box\b/g, (m, s) => `vanaf de ${lr(s)}kant van het doelgebied`],
  [/\bfrom the (left|right) side of the box\b/g, (m, s) => `vanaf de ${lr(s)}kant van het strafschopgebied`],
  [/\bfrom the centre of the six yard box\b/g, 'vanuit het midden van het doelgebied'],
  [/\bfrom a difficult angle on the (left|right)\b/g, (m, s) => `uit een moeilijke hoek aan de ${lr(s)}kant`],
  [/\bfrom long range on the (left|right)\b/g, (m, s) => `van grote afstand aan de ${lr(s)}kant`],
  [/\bfrom more than (\d+) yards\b/g, 'van meer dan $1 meter'],
  [/\bfrom a direct free kick\b/g, 'uit een directe vrije trap'],
  [/\bis saved in the (bottom|top) (left|right) corner\b/g, (m, v, s) => `wordt gered in de ${lr(s)}${v === 'top' ? 'boven' : 'onder'}hoek`],
  [/\bis saved in the (high )?centre of the goal\b/g, (m, high) => `wordt gered ${high ? 'hoog ' : ''}in het midden van het doel`],
  [/\bsaved in the (bottom|top) (left|right) corner\b/g, (m, v, s) => `gered in de ${lr(s)}${v === 'top' ? 'boven' : 'onder'}hoek`],
  [/\bto the (bottom|top) (left|right) corner\b/g, (m, v, s) => `in de ${lr(s)}${v === 'top' ? 'boven' : 'onder'}hoek`],
  [/\bto the (high )?centre of the goal\b/g, (m, high) => `${high ? 'hoog ' : ''}in het midden van het doel`],
  [/\bis close, but misses to the (left|right)\b/g, (m, s) => `gaat net ${side(s)} naast`],
  [/\bis close, but misses the (top )?(left|right) corner\b/g, (m, top, s) => `scheert net langs de ${lr(s)}${top ? 'boven' : 'onder'}hoek`],
  [/\bis just a bit too high\b/g, 'gaat net over'],
  [/\bis too high\b/g, 'gaat over'],
  [/\bis high and wide to the (left|right)\b/g, (m, s) => `gaat hoog en ${side(s)} naast`],
  [/\bmisses to the (left|right)\b/g, (m, s) => `gaat ${side(s)} naast`],
  [/\b(wordt gered [^.]*?|gered [^.]*?) by /g, '$1 door '],
  [/\bis blocked\b/g, 'wordt geblokt'],
  [/\bis saved\b/g, 'wordt gered'],
  [/ Assisted by (.+?) with a cross( following a corner)?\./g, (m, p, c) => ` Aangegeven door ${p} met een voorzet${c ? ' na een hoekschop' : ''}.`],
  [/ Assisted by (.+?) with a headed pass( following a corner)?\./g, (m, p, c) => ` Aangegeven door ${p} met een kopbal${c ? ' na een hoekschop' : ''}.`],
  [/ Assisted by (.+?) with a through ball( following a fast break)?\./g, (m, p, f) => ` Aangegeven door ${p} met een steekpass${f ? ' na een snelle counter' : ''}.`],
  [/ Assisted by (.+?) following a fast break\./g, ' Aangegeven door $1 na een snelle counter.'],
  [/ Assisted by (.+?) following a set piece situation\./g, ' Aangegeven door $1 na een standaardsituatie.'],
  [/ Assisted by (.+?) following a corner\./g, ' Aangegeven door $1 na een hoekschop.'],
  [/ Assisted by (.+?)\./g, ' Aangegeven door $1.'],
  [/ following a corner\./g, ' na een hoekschop.'],
  [/ following a set piece situation\./g, ' na een standaardsituatie.'],
  [/ following a fast break\./g, ' na een snelle counter.'],
  [/ with a cross\./g, ' met een voorzet.'],
];

/** Compound prefix: linker/rechter (linkerpaal, rechterbovenhoek). */
function lr(s) {
  return s === 'left' ? 'linker' : 'rechter';
}

/** Adverb: links/rechts (gaat links naast). */
function side(s) {
  return s === 'left' ? 'links' : 'rechts';
}

function place(where) {
  const w = where.trim();
  if (w === 'in the attacking half') return 'op de helft van de tegenstander';
  if (w === 'in the defensive half') return 'op eigen helft';
  if (w === 'on the left wing') return 'op de linkerflank';
  if (w === 'on the right wing') return 'op de rechterflank';
  return w;
}

function reason(why) {
  const w = String(why || '').trim();
  if (!w) return '';
  const map = {
    'for a bad foul': ' na een harde overtreding',
    'for hand ball': ' voor hands',
    'for time wasting': ' voor tijdrekken',
    'for excessive celebration': ' voor overdreven juichen',
    'for dangerous play': ' voor gevaarlijk spel',
    'for simulation': ' voor een schwalbe',
    'for violent conduct': ' voor gewelddadig gedrag',
    'for unsporting behaviour': ' voor onsportief gedrag',
    'for arguing': ' voor commentaar op de scheidsrechter',
  };
  return map[w] ?? ` ${w}`;
}

function varText(rest) {
  return String(rest)
    .replace(/^Goal (.+?) (\d+-\d+)(.*)$/, 'doelpunt $1 ($2)$3')
    .replace(/^No Goal /, 'geen doelpunt ')
    .replace(/^No Penalty /, 'geen strafschop ')
    .replace(/^Penalty /, 'strafschop ')
    .replace(/^Red Card /, 'rode kaart ')
    .replace(/\(Pen\)/, '(strafschop)')
    .replace(/\s*\.?$/, '.');
}

const TEAM_RE = new RegExp(
  `\\b(${Object.keys(TEAMS).sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'g',
);

/**
 * Translate one ESPN commentary line to Dutch. Returns { text, translated }:
 * translated=false means no rule matched and the English original came back.
 */
export function commentaryToDutch(input) {
  const original = String(input || '');
  let s = original;
  for (const [re, rep] of RULES) s = s.replace(re, rep);
  s = s.replace(TEAM_RE, (m) => TEAMS[m] || m);
  return { text: s, translated: s !== original };
}

// What kind of moment a live-commentary line describes, for the badge in
// front of it. Works on ESPN's English template sentences and on the Dutch
// demo commentary; falls back to the kind the backend attached (if any).
// Plain JS so it runs under node:test.

const RULES = [
  // order matters: the most specific first
  ['own_goal', /^Own Goal\b|\bOwn Goal by\b|Eigen doelpunt/i],
  ['penalty_missed', /^Penalty (missed|saved)!|Strafschop (gemist|gestopt)/i],
  ['penalty_goal', /^(Goal!|GOAL!).*\b(converts the penalty|penalty)\b|benut de strafschop/i],
  ['goal', /^(Goal!|GOAL!)/i],
  ['red_card', /second yellow card|\bred card\b|^ROOD!|Rode kaart|Tweede gele kaart/i],
  ['yellow_card', /\byellow card\b|Gele kaart/i],
  ['substitution', /^Substitution,|^Wissel\b/i],
  ['var', /^VAR\b|VAR[- ]check|VAR-beslissing/i],
  ['save', /^Attempt saved\.|Schot gered|Strafschop gestopt/i],
  ['woodwork', /\bhits the (left |right )?(post|bar)\b|raakt de (linker|rechter)?(paal|lat)/i],
  ['chance', /^Attempt (missed|blocked)\.|^Big chance missed|Gemiste kans|Schot geblokt|Afstandsschot/i],
  ['corner', /^Corner,|^Hoekschop/i],
  ['offside', /^Offside,|^Buitenspel/i],
  ['penalty_awarded', /^Penalty conceded by|^Penalty [^.]+\. .+ draws a foul|Strafschop (veroorzaakt|voor)/i],
  ['injury', /^Delay in match because of an injury|blessure bij/i],
  ['added_time', /minutes? of added time|blessuretijd/i],
  ['period', /^(First|Second) Half (begins|ends)|Half Extra Time (begins|ends)|^Penalty Shootout (begins|ends)|^Match ends|^Lineups are announced|^Aftrap|^Rust\b|^Einde (wedstrijd|van de)|De (eerste|tweede) helft is begonnen|opstellingen zijn bekend/i],
];

/** Badge kind for a commentary line, or null for ordinary play. */
export function commentaryKind(text, fallback = null) {
  const s = String(text || '').trim();
  for (const [kind, re] of RULES) if (re.test(s)) return kind;
  return fallback || null;
}

/** Kinds shown as a prominent full-width line instead of a badge. */
export const HEADLINE_KINDS = new Set(['period', 'added_time']);

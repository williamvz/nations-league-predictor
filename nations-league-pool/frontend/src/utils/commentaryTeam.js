// Which side a live-commentary line is about, for the flag in the combined
// TV feed. Works on ESPN's English templates ("Corner, Netherlands.",
// "Kai Havertz (Germany) …") and on the Dutch demo text ("Wissel bij
// Nederland:"). Plain JS so it runs under node:test.
import { TEAM_NAMES } from '../i18n/translations.js';

// provider spellings that aren't one of our six UI languages
const EXTRA = { TUR: ['Turkey'], CZE: ['Czech Republic'], NED: ['Holland'] };

/** Every known spelling of a team code (all UI languages + aliases). */
export function namesFor(code) {
  const set = new Set(EXTRA[code] || []);
  for (const lang of Object.values(TEAM_NAMES)) if (lang[code]) set.add(lang[code]);
  return [...set];
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// \b doesn't work next to letters like ë (Italië, Servië): Unicode-aware edges
const L = '(?<![\\p{L}\\p{N}])';
const R = '(?![\\p{L}\\p{N}])';

/**
 * 'home' | 'away' | null for a commentary line of the match home–away
 * (given as team codes).
 */
export function actingSide(text, homeCode, awayCode) {
  const s = String(text || '');
  const home = namesFor(homeCode);
  const away = namesFor(awayCode);
  const sideOf = (name) => {
    const n = String(name || '').trim().toLowerCase();
    if (home.some((x) => x.toLowerCase() === n)) return 'home';
    if (away.some((x) => x.toLowerCase() === n)) return 'away';
    return null;
  };
  const all = [...home, ...away].sort((a, b) => b.length - a.length).map(esc).join('|');

  // 1. "Corner, Netherlands." / "Offside, Germany." / "Substitution, Serbia." / "Penalty Germany."
  //    Dutch: "Wissel bij Nederland" / "Hoekschop voor Duitsland" / "… tegen Nederland"
  const lead = new RegExp(`^(?:Corner|Offside|Substitution|Penalty),? (${all})\\.|^Wissel bij (${all})${R}|^Hoekschop voor (${all})${R}|${L}tegen (${all})\\.?$`, 'iu').exec(s);
  if (lead) return sideOf(lead.slice(1).find(Boolean));

  // 2. the first team in parentheses: "Cody Gakpo (Netherlands) right footed shot …"
  for (const m of s.matchAll(/\(([^()]+)\)/g)) {
    const side = sideOf(m[1]);
    if (side) return side;
  }

  // 3. "Own Goal by X, Germany." → the team of the own-goal scorer
  const og = new RegExp(`Own Goal by [^,]+, (${all})\\.`, 'iu').exec(s);
  if (og) return sideOf(og[1]);

  // 4. "… voor Nederland" (demo penalty line)
  const voor = new RegExp(`${L}voor (${all})${R}`, 'iu').exec(s);
  if (voor) return sideOf(voor[1]);

  // 5. the first team mentioned at all ("Nederland zet druk op …")
  const first = new RegExp(`${L}(${all})${R}`, 'iu').exec(s);
  return first ? sideOf(first[1]) : null;
}

/** Rough wall-clock time of a match minute ("67'", "45'+2'", "HT"), for ordering. */
export function estimateTime(kickoffIso, minute) {
  const k = new Date(kickoffIso).getTime();
  const m = /^(\d+)'?(?:\+(\d+))?/.exec(String(minute || ''));
  if (!m) return null;
  const base = Number(m[1]);
  const extra = Number(m[2] || 0);
  const halftime = base > 45 ? 15 : 0; // second half starts after the break
  return k + (base + extra + halftime) * 60_000;
}

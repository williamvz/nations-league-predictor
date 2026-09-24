// ESPN public soccer API — no API key required.
// Scoreboard: https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.nations/scoreboard?dates=YYYYMMDD
// Events carry live status, scores and scoring plays (goal scorers).

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.nations';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; NationsLeaguePool/1.0)', Accept: 'application/json' };

async function get(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`);
  return res.json();
}

const STATUS_MAP = { pre: 'scheduled', in: 'live', post: 'finished' };

/** Live clock: displayClock ("34'"), else shortDetail ("34'", "HT"), else period. */
export function liveMinute(ev, comp) {
  const st = ev?.status || comp?.status || {};
  const clock = String(st.displayClock || '').trim();
  if (clock && clock !== "0'" && clock !== '0:00') return clock;
  const detail = String(st.type?.shortDetail || st.type?.detail || '').trim();
  if (/^(ht|halftime|half time)$/i.test(detail)) return 'HT';
  if (/\d+'/.test(detail)) return detail.match(/\d+'(\+\d+')?/)[0];
  if (/half/i.test(st.type?.description || '')) return 'HT';
  return null;
}

/**
 * Fetch all events for a calendar date (YYYYMMDD, or YYYYMMDD-YYYYMMDD range).
 * Returns normalized events:
 * { providerId, homeName, awayName, homeScore, awayScore, status, minute, kickoffIso, goals: [{player, teamName, minute, ownGoal, penalty}] }
 */
export async function fetchEvents(dates) {
  const data = await get(`${BASE}/scoreboard?dates=${dates}`);
  const events = [];
  for (const ev of data.events || []) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    const home = comp.competitors?.find((c) => c.homeAway === 'home');
    const away = comp.competitors?.find((c) => c.homeAway === 'away');
    if (!home || !away) continue;

    const state = ev.status?.type?.state || comp.status?.type?.state;
    const status = STATUS_MAP[state] || 'scheduled';

    const goals = [];
    for (const d of comp.details || []) {
      const isGoal = d.scoringPlay === true || /goal/i.test(d.type?.text || '');
      if (!isGoal || /shootout/i.test(d.type?.text || '')) continue;
      const player = d.athletesInvolved?.[0]?.displayName;
      if (!player) continue;
      goals.push({
        player,
        teamId: d.team?.id,
        teamName: d.team?.id === home.team?.id ? home.team?.displayName : away.team?.displayName,
        minute: d.clock?.displayValue || null,
        ownGoal: d.ownGoal === true || /own goal/i.test(d.type?.text || ''),
        penalty: d.penaltyKick === true || /penalty/i.test(d.type?.text || ''),
      });
    }

    events.push({
      providerId: ev.id,
      homeName: home.team?.displayName || home.team?.name,
      awayName: away.team?.displayName || away.team?.name,
      // set on knockout matches decided after extra time / penalties
      winnerName: home.winner === true ? home.team?.displayName : away.winner === true ? away.team?.displayName : null,
      homeScore: home.score != null ? Number(home.score) : null,
      awayScore: away.score != null ? Number(away.score) : null,
      status,
      minute: status === 'live' ? liveMinute(ev, comp) : null,
      kickoffIso: ev.date ? new Date(ev.date).toISOString() : null,
      goals,
      // baseline match details straight from the scoreboard (stats, goals,
      // cards, venue); the richer /summary is merged on top when it works
      details: status === 'scheduled' ? null : parseScoreboardDetails(comp, home, away, status),
    });
  }
  return events;
}

// ---------------------------------------------------------------------------
// Match details: /summary?event=<id> carries everything beyond the score —
// team statistics, key events (cards, subs, VAR), line-ups, live commentary,
// venue/referee, head-to-head and, after the final whistle, a written recap.
// ESPN's shape is unofficial and varies per match, so every field is optional
// and the parser never throws on missing parts.
// ---------------------------------------------------------------------------

/** Stats we show, in display order (ESPN boxscore stat names). */
export const STAT_KEYS = [
  'possessionPct', 'totalShots', 'shotsOnTarget', 'wonCorners', 'foulsCommitted',
  'yellowCards', 'redCards', 'offsides', 'saves', 'accuratePasses', 'totalPasses',
  'passPct', 'totalCrosses', 'totalTackles', 'interceptions',
];

const SUMMARY_URLS = [
  (id) => `${BASE}/summary?event=${id}`,
  // league-agnostic variant, in case the competition slug is rejected
  (id) => `https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=${id}`,
];

export async function fetchSummary(eventId) {
  const id = encodeURIComponent(eventId);
  let lastErr;
  for (const url of SUMMARY_URLS) {
    try {
      return parseSummary(await get(url(id)));
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/**
 * Details from a scoreboard competition: team stats, goals and cards,
 * venue/attendance. Same normalized shape as parseSummary.
 */
export function parseScoreboardDetails(comp, home, away, status = null) {
  const ids = { home: String(home?.team?.id ?? home?.id ?? ''), away: String(away?.team?.id ?? away?.id ?? '') };
  const byTeam = { home: {}, away: {} };
  for (const [side, c] of [['home', home], ['away', away]]) {
    for (const st of c?.statistics || []) byTeam[side][st.name] = num(st.displayValue ?? st.value);
  }
  const stats = [];
  for (const key of STAT_KEYS) {
    const h = byTeam.home[key];
    const a = byTeam.away[key];
    if (h == null && a == null) continue;
    stats.push({ key, home: normStat(key, h), away: normStat(key, a) });
  }

  const timeline = [];
  for (const d of comp?.details || []) {
    const typeText = d.type?.text || '';
    let kind = classifyEvent(typeText, '', d.scoringPlay === true);
    if (d.ownGoal === true && d.scoringPlay) kind = 'own_goal';
    else if (d.penaltyKick === true && d.scoringPlay) kind = 'penalty_goal';
    else if (d.redCard === true) kind = 'red_card';
    else if (d.yellowCard === true && kind !== 'red_card') kind = 'yellow_card';
    if (!kind || kind === 'shootout' || kind === 'period') continue;
    timeline.push({
      id: `sb-${timeline.length}-${d.clock?.value ?? ''}`,
      kind,
      minute: clean(d.clock?.displayValue),
      side: sideOf(d.team?.id, ids),
      player: d.athletesInvolved?.[0]?.displayName || null,
      related: null,
      text: null,
    });
  }

  const venue = comp?.venue || {};
  return {
    status,
    stats,
    timeline,
    lineups: {},
    commentary: [],
    info: {
      venue: clean(venue.fullName),
      city: clean([venue.address?.city, venue.address?.country].filter(Boolean).join(', ')),
      attendance: num(comp?.attendance) || null,
      referee: null,
    },
    article: null,
    h2h: [],
  };
}

/** Fill the gaps in `primary` (usually /summary) from `fallback` (scoreboard). */
export function mergeDetails(primary, fallback) {
  if (!primary) return fallback || null;
  if (!fallback) return primary;
  const pick = (a, b) => (Array.isArray(a) && a.length ? a : b || a || []);
  const info = { ...(fallback.info || {}) };
  for (const [k, v] of Object.entries(primary.info || {})) if (v != null && v !== '') info[k] = v;
  return {
    ...primary,
    status: primary.status || fallback.status || null,
    stats: pick(primary.stats, fallback.stats),
    timeline: pick(primary.timeline, fallback.timeline),
    commentary: pick(primary.commentary, fallback.commentary),
    h2h: pick(primary.h2h, fallback.h2h),
    lineups: Object.keys(primary.lineups || {}).length ? primary.lineups : fallback.lineups || {},
    info,
    article: primary.article || fallback.article || null,
  };
}

/** True when a parsed payload carries nothing worth showing. */
export function isEmptyDetails(d) {
  if (!d) return true;
  return !d.stats?.length && !d.timeline?.length && !d.commentary?.length && !d.article
    && !Object.keys(d.lineups || {}).length && !d.h2h?.length && !d.info?.venue && !d.info?.referee;
}

const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace('%', ''));
  return Number.isFinite(n) ? n : null;
};
const clean = (s) => (typeof s === 'string' ? s.trim() : s ?? null) || null;

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', laquo: '«', raquo: '»', szlig: 'ß', aelig: 'æ', oslash: 'ø', eth: 'ð',
};
// &uuml; &eacute; &ccedil; … → letter + combining mark
const ACCENTS = { uml: '\u0308', acute: '\u0301', grave: '\u0300', circ: '\u0302', tilde: '\u0303', cedil: '\u0327', ring: '\u030A', caron: '\u030C' };
/** HTML story → plain paragraphs (rendered as text, never as HTML). */
export function htmlToParagraphs(html) {
  if (!html) return [];
  return String(html)
    .replace(/<(script|style|iframe|aside|figure)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\s*(br|\/p|\/h\d|\/li|\/div)\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      if (ENTITIES[e] ?? ENTITIES[e.toLowerCase()]) return ENTITIES[e] ?? ENTITIES[e.toLowerCase()];
      const acc = /^([a-z])(uml|acute|grave|circ|tilde|cedil|ring|caron)$/i.exec(e);
      return acc ? (acc[1] + ACCENTS[acc[2].toLowerCase()]).normalize('NFC') : m;
    })
    .split(/\n+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 1);
}

/** Classify an ESPN key event / play into our own small vocabulary. */
export function classifyEvent(typeText = '', text = '', scoringPlay = false) {
  const s = `${typeText} ${text}`.toLowerCase();
  if (/shootout/.test(s)) return 'shootout';
  if (/own goal/.test(s)) return 'own_goal';
  if (/penalty/.test(s) && /(miss|saved|save)/.test(s) && !scoringPlay) return 'penalty_missed';
  if (scoringPlay || /\bgoal\b/.test(typeText.toLowerCase())) return /penalty/.test(s) ? 'penalty_goal' : 'goal';
  if (/second yellow|red card/.test(s)) return 'red_card';
  if (/yellow card/.test(s)) return 'yellow_card';
  if (/substitution/.test(s)) return 'substitution';
  if (/\bvar\b|video assistant/.test(s)) return 'var';
  if (/half.?time|end regular time|full.?time|end of|kickoff|start of|extra time/.test(s)) return 'period';
  return null;
}

function sideOf(teamId, ids) {
  if (teamId == null) return null;
  if (String(teamId) === ids.home) return 'home';
  if (String(teamId) === ids.away) return 'away';
  return null;
}

/** Percentages as whole numbers; ESPN sends passPct as a 0–1 fraction. */
function normStat(key, v) {
  if (v == null) return 0;
  if (key === 'passPct' || key === 'possessionPct') return Math.round(v <= 1 && key === 'passPct' ? v * 100 : v);
  return v;
}

/**
 * Normalize an ESPN summary payload:
 * { stats, timeline, lineups, commentary, info, article, h2h, status }
 */
export function parseSummary(data) {
  const comp = data?.header?.competitions?.[0] || {};
  const competitors = comp.competitors || [];
  const homeC = competitors.find((c) => c.homeAway === 'home');
  const awayC = competitors.find((c) => c.homeAway === 'away');
  const ids = { home: String(homeC?.team?.id ?? homeC?.id ?? ''), away: String(awayC?.team?.id ?? awayC?.id ?? '') };

  // --- team statistics -----------------------------------------------------
  const byTeam = { home: {}, away: {} };
  for (const t of data?.boxscore?.teams || []) {
    const side = t.homeAway || sideOf(t.team?.id, ids);
    if (side !== 'home' && side !== 'away') continue;
    for (const s of t.statistics || []) byTeam[side][s.name] = num(s.displayValue ?? s.value);
  }
  const stats = [];
  for (const key of STAT_KEYS) {
    const h = byTeam.home[key];
    const a = byTeam.away[key];
    if (h == null && a == null) continue;
    stats.push({ key, home: normStat(key, h), away: normStat(key, a) });
  }

  // --- timeline (key events) ----------------------------------------------
  const timeline = [];
  for (const e of data?.keyEvents || []) {
    const typeText = e.type?.text || e.type?.type || '';
    const kind = classifyEvent(typeText, e.text || '', e.scoringPlay === true);
    if (!kind || kind === 'shootout') continue;
    const people = (e.participants || []).map((p) => p.athlete?.displayName).filter(Boolean);
    let player = people[0] || null;
    let related = people[1] || null;
    if (kind === 'substitution') {
      // "Substitution, Netherlands. Joshua Zirkzee replaces Memphis Depay."
      const m = /\.\s*(.+?) replaces (.+?)(?:\s+because.*)?\.?$/i.exec(e.text || '');
      if (m) { player = m[1].trim(); related = m[2].trim(); }
    }
    if (kind === 'goal' || kind === 'penalty_goal') {
      const m = /Assisted by (.+?)(?: with|\.|$)/i.exec(e.text || '');
      if (m) related = m[1].trim();
      else if (!/assist/i.test(e.text || '')) related = null;
    }
    timeline.push({
      id: String(e.id ?? `${kind}-${timeline.length}`),
      kind,
      minute: clean(e.clock?.displayValue),
      side: sideOf(e.team?.id, ids),
      player,
      related,
      text: kind === 'period' ? clean(typeText) : null,
    });
  }

  // --- line-ups ------------------------------------------------------------
  const lineups = {};
  for (const r of data?.rosters || []) {
    const side = r.homeAway || sideOf(r.team?.id, ids);
    if (side !== 'home' && side !== 'away') continue;
    const players = (r.roster || []).map((p) => ({
      name: p.athlete?.displayName || p.athlete?.fullName || '?',
      jersey: clean(p.jersey != null ? String(p.jersey) : null),
      position: clean(p.position?.abbreviation),
      starter: p.starter === true,
      subbedIn: p.subbedIn === true || p.subbedIn?.didSub === true,
      subbedOut: p.subbedOut === true || p.subbedOut?.didSub === true,
      place: num(p.formationPlace),
    }));
    if (!players.length) continue;
    lineups[side] = {
      formation: clean(r.formation),
      starters: players.filter((p) => p.starter).sort((x, y) => (x.place ?? 99) - (y.place ?? 99)),
      bench: players.filter((p) => !p.starter),
    };
  }

  // --- live commentary (newest first) --------------------------------------
  const commentary = (data?.commentary || [])
    .map((c, i) => ({
      seq: num(c.sequence) ?? i,
      minute: clean(c.time?.displayValue),
      text: clean(c.text),
      kind: c.play ? classifyEvent(c.play.type?.text || '', c.text || '', c.play.scoringPlay === true) : null,
    }))
    .filter((c) => c.text)
    .sort((a, b) => b.seq - a.seq);

  // --- venue / officials ---------------------------------------------------
  const gi = data?.gameInfo || {};
  const role = (o) => String(o.position?.name || o.position?.displayName || '').trim().toLowerCase();
  const officials = gi.officials || [];
  const referee = officials.find((o) => role(o) === 'referee')
    || officials.find((o) => /referee/.test(role(o)) && !/assistant|fourth|video|var/.test(role(o)))
    || officials.find((o) => !role(o));
  const info = {
    venue: clean(gi.venue?.fullName),
    city: clean([gi.venue?.address?.city, gi.venue?.address?.country].filter(Boolean).join(', ')),
    attendance: num(gi.attendance) || null,
    referee: clean(referee?.displayName || referee?.fullName),
  };

  // --- written recap -------------------------------------------------------
  let article = null;
  const art = data?.article || data?.news?.articles?.find((a) => /recap|report/i.test(a.type || a.headline || ''));
  if (art && (art.story || art.description)) {
    const paragraphs = htmlToParagraphs(art.story || art.description);
    if (paragraphs.length) {
      article = {
        headline: clean(art.headline),
        description: clean(art.description),
        paragraphs,
        url: clean(art.links?.web?.href),
        published: clean(art.published || art.lastModified),
      };
    }
  }

  // --- head to head --------------------------------------------------------
  const h2h = [];
  for (const block of data?.headToHeadGames || []) {
    for (const g of block.events || []) {
      const date = clean(g.gameDate);
      const homeScore = num(g.homeTeamScore);
      const awayScore = num(g.awayTeamScore);
      if (!date || homeScore == null || awayScore == null) continue;
      // express each result from *this* match's home/away perspective
      const flipped = g.homeTeamId != null && String(g.homeTeamId) === ids.away;
      h2h.push({
        date,
        competition: clean(g.leagueName || g.leagueAbbreviation),
        homeScore: flipped ? awayScore : homeScore,
        awayScore: flipped ? homeScore : awayScore,
        venueSwapped: flipped,
      });
    }
    break; // both blocks list the same games
  }
  h2h.sort((a, b) => (a.date < b.date ? 1 : -1));

  const state = comp.status?.type?.state || data?.header?.competitions?.[0]?.status?.type?.state;
  return {
    status: STATUS_MAP[state] || null,
    stats,
    timeline,
    lineups,
    commentary: commentary.slice(0, 200),
    info,
    article,
    h2h: h2h.slice(0, 6),
  };
}

// TheSportsDB — free community API (key "3" is the public test key).
// UEFA Nations League = league id 4490.
// Season events: /api/v1/json/3/eventsseason.php?id=4490&s=2026-2027

const KEY = process.env.THESPORTSDB_KEY || '3';
const BASE = `https://www.thesportsdb.com/api/v1/json/${KEY}`;
const LEAGUE_ID = '4490';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; NationsLeaguePool/1.0)', Accept: 'application/json' };

async function get(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`TheSportsDB ${res.status} for ${url}`);
  return res.json();
}

function mapStatus(strStatus, hasScore) {
  const s = (strStatus || '').toLowerCase();
  if (['ft', 'aet', 'pen', 'match finished', 'finished'].includes(s)) return 'finished';
  if (['1h', '2h', 'ht', 'et', 'live', 'in progress'].some((x) => s.includes(x))) return 'live';
  if (['post.', 'postponed', 'canc.', 'cancelled'].some((x) => s.includes(x))) return 'postponed';
  // Older entries sometimes have no status but a filled score
  if (hasScore && s === '') return 'finished';
  return 'scheduled';
}

/** Fetch the whole season's events, normalized like the ESPN provider. */
export async function fetchSeason(season = '2026-2027') {
  const data = await get(`${BASE}/eventsseason.php?id=${LEAGUE_ID}&s=${season}`);
  const events = [];
  for (const ev of data.events || []) {
    const hasScore = ev.intHomeScore != null && ev.intHomeScore !== '';
    let kickoffIso = null;
    if (ev.strTimestamp) {
      // strTimestamp is UTC, e.g. "2026-09-24 18:45:00"
      kickoffIso = new Date(`${ev.strTimestamp.replace(' ', 'T')}Z`).toISOString();
    } else if (ev.dateEvent) {
      kickoffIso = new Date(`${ev.dateEvent}T${ev.strTime || '19:00:00'}Z`).toISOString();
    }
    events.push({
      providerId: ev.idEvent,
      homeName: ev.strHomeTeam,
      awayName: ev.strAwayTeam,
      homeScore: hasScore ? Number(ev.intHomeScore) : null,
      awayScore: ev.intAwayScore != null && ev.intAwayScore !== '' ? Number(ev.intAwayScore) : null,
      status: mapStatus(ev.strStatus, hasScore),
      minute: null,
      kickoffIso,
      goals: [], // free tier has no reliable per-goal data
    });
  }
  return events;
}

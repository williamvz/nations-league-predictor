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
      homeScore: home.score != null ? Number(home.score) : null,
      awayScore: away.score != null ? Number(away.score) : null,
      status,
      minute: status === 'live' ? (ev.status?.displayClock || null) : null,
      kickoffIso: ev.date ? new Date(ev.date).toISOString() : null,
      goals,
    });
  }
  return events;
}

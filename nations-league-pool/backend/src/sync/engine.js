import db, { getSetting } from '../db/database.js';
import { fetchEvents as espnFetch } from './providers/espn.js';
import { fetchSeason as tsdbFetch } from './providers/sportsdb.js';
import { findTeam, findMatch, rememberProviderId } from './matcher.js';
import { processMatchResult } from '../services/scoring.js';
import { resolveBonusQuestions } from '../services/bonus.js';
import { broadcast } from '../services/notify.js';
import { fireHomeAssistantEvent } from '../services/ha.js';

function log(job, provider, ok, message) {
  db.prepare('INSERT INTO sync_log (job, provider, ok, message) VALUES (?, ?, ?, ?)')
    .run(job, provider, ok ? 1 : 0, String(message).slice(0, 500));
  const icon = ok ? '✅' : '⚠️';
  console.log(`${icon} [sync:${job}${provider ? ':' + provider : ''}] ${message}`);
}

export function syncEnabled() {
  return getSetting('sync_enabled', '1') === '1';
}

export const DEMO_MODE = process.env.DEMO_MODE === '1';

/** Demo mode: one pass over the built-in simulator instead of the network. */
async function syncSimulated() {
  const { fetchSimulatedEvents } = await import('./providers/simulator.js');
  const events = fetchSimulatedEvents();
  let matched = 0;
  for (const ev of events) if (applyEvent(ev, 'sim', { updateKickoff: false }).matched) matched += 1;
  if (matched > 0) log('scores', 'sim', true, `${events.length} gesimuleerde events, ${matched} verwerkt`);
  // no classifyFinals here: simulated events carry explicit, correct stages
  resolveBonusQuestions();
  return { provider: 'sim', matched };
}

/** Dates (YYYYMMDD, UTC-based with 1-day margin) that need score attention. */
function datesNeedingScores() {
  const rows = db.prepare(`
    SELECT DISTINCT date(kickoff_utc) AS d FROM matches
    WHERE status IN ('scheduled', 'live')
      AND datetime(kickoff_utc) <= datetime('now', '+30 minutes')
      AND datetime(kickoff_utc) >= datetime('now', '-3 days')
  `).all();
  const days = new Set();
  for (const r of rows) {
    days.add(r.d);
    // a 20:45 CET kickoff lands on the same UTC date, but add the next
    // day too so late finishes and provider date-bucketing can't hide a match
    const next = new Date(`${r.d}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    days.add(next.toISOString().slice(0, 10));
  }
  return [...days].sort().map((d) => d.replaceAll('-', ''));
}

/**
 * Knockout rounds are drawn after the league phase, so their fixtures can't
 * be seeded up front. When a provider sends a match between two League A
 * teams in a knockout window, we create it automatically.
 * Returns 'quarterfinal' for the March 2027 window and 'semifinal' for the
 * June 2027 Finals window (the exact semi/third-place/final split is fixed
 * afterwards by classifyFinals). Promotion/relegation play-offs involve
 * League B teams we don't track, so those events never match two teams.
 */
export function inferKnockoutStage(kickoffIso) {
  const d = kickoffIso.slice(0, 10);
  if (d >= '2027-03-01' && d <= '2027-04-15') return 'quarterfinal';
  if (d >= '2027-05-20' && d <= '2027-06-30') return 'semifinal';
  return null;
}

function knockoutMatchday(stage, kickoffIso) {
  if (stage === 'quarterfinal') {
    // two-legged: first legs 25-27 March, returns 28-30 March
    return kickoffIso.slice(0, 10) <= '2027-03-27' ? 7 : 8;
  }
  return 9; // Finals week
}

function createKnockoutMatch(ev, provider, home, away) {
  // the demo simulator provides explicit stage/matchday (its kickoffs are
  // time-compressed and fall outside the real 2027 windows)
  const stage = ev.stage || inferKnockoutStage(ev.kickoffIso);
  if (!stage || stage === 'league') return null; // never invent league fixtures
  const matchday = ev.matchday || knockoutMatchday(stage, ev.kickoffIso);
  let info;
  try {
    info = db.prepare(`
      INSERT INTO matches (matchday, group_name, stage, home_team_id, away_team_id, kickoff_utc, kickoff_confirmed)
      VALUES (?, 'KO', ?, ?, ?, ?, 1)
    `).run(matchday, stage, home.id, away.id, ev.kickoffIso);
  } catch {
    // another provider already created this pairing (UNIQUE home/away/stage)
    return db.prepare('SELECT * FROM matches WHERE home_team_id = ? AND away_team_id = ? AND stage = ?')
      .get(home.id, away.id, stage);
  }
  log('fixtures', provider, true, `Knock-outwedstrijd toegevoegd: ${home.code}-${away.code} (${stage})`);
  broadcast('fixture', `Nieuwe knock-outwedstrijd! 🏆`,
    `${home.flag} ${home.name_nl} – ${away.name_nl} ${away.flag}. Voorspellen kan vanaf nu!`);
  return db.prepare('SELECT * FROM matches WHERE id = ?').get(info.lastInsertRowid);
}

/**
 * The June Finals arrive from providers as an undifferentiated batch; kickoff
 * order settles what is what: first two = semifinals, then third place, then
 * the final. Re-runs safely as fixtures firm up.
 */
export function classifyFinals() {
  const finals = db.prepare(`
    SELECT * FROM matches WHERE stage IN ('semifinal', 'third_place', 'final')
    ORDER BY kickoff_utc ASC, id ASC
  `).all();
  if (finals.length < 3) return;
  const order = finals.length >= 4
    ? ['semifinal', 'semifinal', 'third_place', 'final']
    : ['semifinal', 'semifinal', 'final'];
  for (let i = 0; i < finals.length; i++) {
    const want = order[Math.min(i, order.length - 1)];
    if (finals[i].stage !== want) {
      db.prepare("UPDATE matches SET stage = ?, points_calculated = 0, updated_at = datetime('now') WHERE id = ?")
        .run(want, finals[i].id);
      if (finals[i].status === 'finished') processMatchResult(finals[i].id, { notify: false });
    }
  }
}

export function applyEvent(ev, provider, { updateKickoff = false } = {}) {
  const home = findTeam(ev.homeName);
  const away = findTeam(ev.awayName);
  if (!home || !away) return { matched: false };

  let match = findMatch(provider, ev.providerId, home, away, ev.kickoffIso, ev.stage || null);
  if (!match && ev.kickoffIso) match = createKnockoutMatch(ev, provider, home, away);
  if (!match) return { matched: false };

  rememberProviderId(match.id, provider, ev.providerId);

  // Never let a provider overwrite a manually entered final result.
  if (match.status === 'finished' && match.result_source === 'manual') return { matched: true };

  let changed = false;

  if (updateKickoff && ev.kickoffIso && match.status === 'scheduled') {
    const drift = Math.abs(new Date(ev.kickoffIso) - new Date(match.kickoff_utc));
    if (drift > 60 * 1000) {
      db.prepare("UPDATE matches SET kickoff_utc = ?, kickoff_confirmed = 1, updated_at = datetime('now') WHERE id = ?")
        .run(ev.kickoffIso, match.id);
      changed = true;
    } else if (!match.kickoff_confirmed) {
      db.prepare('UPDATE matches SET kickoff_confirmed = 1 WHERE id = ?').run(match.id);
    }
  }

  if (ev.status === 'live' && ev.homeScore != null) {
    // a score increase = GOAL → event on the HA bus for light-show automations
    const prevHome = match.status === 'live' ? (match.home_score ?? 0) : 0;
    const prevAway = match.status === 'live' ? (match.away_score ?? 0) : 0;
    if (ev.homeScore > prevHome || ev.awayScore > prevAway) {
      const scoringTeam = ev.homeScore > prevHome ? home : away;
      const lastGoal = ev.goals?.length ? ev.goals[ev.goals.length - 1] : null;
      fireHomeAssistantEvent('nlpool_goal', {
        team_code: scoringTeam.code,
        team: scoringTeam.name_nl,
        player: lastGoal?.player || null,
        minute: ev.minute,
        score: `${ev.homeScore}-${ev.awayScore}`,
        home: home.code,
        away: away.code,
      }).catch(() => {});
    }
    db.prepare(`
      UPDATE matches SET status = 'live', minute = ?, home_score = ?, away_score = ?,
        result_source = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(ev.minute, ev.homeScore, ev.awayScore, provider, match.id);
    changed = true;
  }

  if (ev.status === 'finished' && ev.homeScore != null && ev.awayScore != null) {
    db.prepare(`
      UPDATE matches SET status = 'finished', minute = NULL, home_score = ?, away_score = ?,
        result_source = ?, points_calculated = 0, updated_at = datetime('now')
      WHERE id = ? AND (status != 'finished' OR home_score != ? OR away_score != ? OR points_calculated = 0)
    `).run(ev.homeScore, ev.awayScore, provider, match.id, ev.homeScore, ev.awayScore);
    if (ev.winnerName) {
      const winner = findTeam(ev.winnerName);
      if (winner) db.prepare('UPDATE matches SET winner_team_id = ? WHERE id = ?').run(winner.id, match.id);
    }
    storeGoals(match, ev, home, away);
    processMatchResult(match.id);
    if (match.status !== 'finished') {
      fireHomeAssistantEvent('nlpool_result', {
        home: home.code, away: away.code,
        home_team: home.name_nl, away_team: away.name_nl,
        score: `${ev.homeScore}-${ev.awayScore}`,
        stage: match.stage, matchday: match.matchday,
      }).catch(() => {});
    }
    changed = true;
  }

  if (ev.status === 'postponed' && match.status === 'scheduled') {
    db.prepare("UPDATE matches SET status = 'postponed', updated_at = datetime('now') WHERE id = ?").run(match.id);
    changed = true;
  }

  return { matched: true, changed };
}

function storeGoals(match, ev, home, away) {
  if (!ev.goals?.length) return;
  const ins = db.prepare(`
    INSERT OR IGNORE INTO match_events (match_id, event_type, player_name, team_id, minute)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const g of ev.goals) {
    const team = findTeam(g.teamName) || (g.teamName === ev.homeName ? home : away);
    // own goals count for the scoring team's opponent but not for topscorer
    const type = g.ownGoal ? 'own_goal' : g.penalty ? 'penalty' : 'goal';
    ins.run(match.id, type, g.player, team ? team.id : null, g.minute);
  }
  recomputeScorers();
}

/** Rebuild the aggregated top-scorer table from stored goal events. */
export function recomputeScorers() {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM scorers WHERE source = 'sync'").run();
    db.prepare(`
      INSERT INTO scorers (player_name, team_id, goals, source)
      SELECT player_name, team_id, COUNT(*), 'sync'
      FROM match_events
      WHERE event_type IN ('goal', 'penalty')
      GROUP BY player_name, team_id
      ON CONFLICT(player_name, team_id) DO UPDATE SET goals = excluded.goals, updated_at = datetime('now')
    `).run();
  });
  tx();
}

/**
 * Poll live/finished scores for dates that need it. ESPN first (live minute +
 * goal scorers), TheSportsDB as fallback.
 */
export async function syncScores() {
  if (!syncEnabled()) return { skipped: true };
  if (DEMO_MODE) return syncSimulated();
  const dates = datesNeedingScores();
  if (dates.length === 0) return { skipped: true, reason: 'geen wedstrijden in venster' };

  const range = dates.length === 1 ? dates[0] : `${dates[0]}-${dates[dates.length - 1]}`;
  let matched = 0;
  try {
    const events = await espnFetch(range);
    for (const ev of events) if (applyEvent(ev, 'espn').matched) matched += 1;
    log('scores', 'espn', true, `${events.length} events, ${matched} gematcht (${range})`);
    classifyFinals();
    resolveBonusQuestions();
    return { provider: 'espn', matched };
  } catch (err) {
    log('scores', 'espn', false, err.message);
  }

  try {
    const events = await tsdbFetch();
    for (const ev of events) if (applyEvent(ev, 'tsdb').matched) matched += 1;
    log('scores', 'tsdb', true, `${events.length} events, ${matched} gematcht (fallback)`);
    classifyFinals();
    resolveBonusQuestions();
    return { provider: 'tsdb', matched };
  } catch (err) {
    log('scores', 'tsdb', false, err.message);
    return { error: true };
  }
}

/**
 * Sync the fixture calendar (kickoff times get confirmed/corrected, postponed
 * matches flagged). Runs daily and at boot; providers are the source of truth
 * for *when*, our seed for *what*.
 */
export async function syncFixtures() {
  if (!syncEnabled()) return { skipped: true };
  if (DEMO_MODE) return syncSimulated();
  let ok = false;
  try {
    const events = await tsdbFetch();
    let matched = 0;
    for (const ev of events) if (applyEvent(ev, 'tsdb', { updateKickoff: true }).matched) matched += 1;
    log('fixtures', 'tsdb', true, `${events.length} events, ${matched} gematcht`);
    ok = true;
  } catch (err) {
    log('fixtures', 'tsdb', false, err.message);
  }

  // ESPN pass over the full tournament window: confirms kickoffs and catches
  // up on any results we missed while the Pi was off.
  try {
    const range = tournamentDateRange();
    if (range) {
      const events = await espnFetch(range);
      let matched = 0;
      for (const ev of events) if (applyEvent(ev, 'espn', { updateKickoff: true }).matched) matched += 1;
      log('fixtures', 'espn', true, `${events.length} events, ${matched} gematcht`);
      ok = true;
    }
  } catch (err) {
    log('fixtures', 'espn', false, err.message);
  }
  classifyFinals();
  resolveBonusQuestions();
  return { ok };
}

function tournamentDateRange() {
  const row = db.prepare(`
    SELECT MIN(date(kickoff_utc)) AS lo, MAX(date(kickoff_utc)) AS hi FROM matches
    WHERE datetime(kickoff_utc) <= datetime('now', '+7 days')
      AND (status != 'finished' OR points_calculated = 0)
  `).get();
  if (!row?.lo) return null;
  return `${row.lo.replaceAll('-', '')}-${row.hi.replaceAll('-', '')}`;
}

/** True when a match is live or kicks off within 30 minutes. */
export function inLiveWindow() {
  const row = db.prepare(`
    SELECT COUNT(*) AS n FROM matches
    WHERE status = 'live'
       OR (status = 'scheduled'
           AND datetime(kickoff_utc) <= datetime('now', '+30 minutes')
           AND datetime(kickoff_utc) >= datetime('now', '-4 hours'))
  `).get();
  return row.n > 0;
}

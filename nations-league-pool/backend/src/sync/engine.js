import db, { getSetting } from '../db/database.js';
import { fetchEvents as espnFetch } from './providers/espn.js';
import { fetchSeason as tsdbFetch } from './providers/sportsdb.js';
import { findTeam, findMatch, rememberProviderId } from './matcher.js';
import { processMatchResult } from '../services/scoring.js';
import { resolveBonusQuestions } from '../services/bonus.js';

function log(job, provider, ok, message) {
  db.prepare('INSERT INTO sync_log (job, provider, ok, message) VALUES (?, ?, ?, ?)')
    .run(job, provider, ok ? 1 : 0, String(message).slice(0, 500));
  const icon = ok ? '✅' : '⚠️';
  console.log(`${icon} [sync:${job}${provider ? ':' + provider : ''}] ${message}`);
}

export function syncEnabled() {
  return getSetting('sync_enabled', '1') === '1';
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

function applyEvent(ev, provider, { updateKickoff = false } = {}) {
  const home = findTeam(ev.homeName);
  const away = findTeam(ev.awayName);
  if (!home || !away) return { matched: false };

  const match = findMatch(provider, ev.providerId, home, away, ev.kickoffIso);
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
    storeGoals(match, ev, home, away);
    processMatchResult(match.id);
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
  const dates = datesNeedingScores();
  if (dates.length === 0) return { skipped: true, reason: 'geen wedstrijden in venster' };

  const range = dates.length === 1 ? dates[0] : `${dates[0]}-${dates[dates.length - 1]}`;
  let matched = 0;
  try {
    const events = await espnFetch(range);
    for (const ev of events) if (applyEvent(ev, 'espn').matched) matched += 1;
    log('scores', 'espn', true, `${events.length} events, ${matched} gematcht (${range})`);
    resolveBonusQuestions();
    return { provider: 'espn', matched };
  } catch (err) {
    log('scores', 'espn', false, err.message);
  }

  try {
    const events = await tsdbFetch();
    for (const ev of events) if (applyEvent(ev, 'tsdb').matched) matched += 1;
    log('scores', 'tsdb', true, `${events.length} events, ${matched} gematcht (fallback)`);
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

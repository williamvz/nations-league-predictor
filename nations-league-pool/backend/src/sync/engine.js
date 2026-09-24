import db, { getSetting } from '../db/database.js';
import { fetchEventsForDays as espnFetchDays, fetchSummary as espnSummary, mergeDetails, isEmptyDetails } from './providers/espn.js';
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
  for (const ev of events) {
    if (!ev.details) continue;
    const m = db.prepare(`
      SELECT m.id, d.complete FROM matches m LEFT JOIN match_details d ON d.match_id = m.id
      WHERE json_extract(m.provider_ids, '$.sim') = ?
    `).get(ev.providerId);
    // finished + stored once = final; don't rewrite it on every 20s tick
    if (m && !m.complete) storeDetails(m.id, 'sim', ev.details, ev.status === 'finished');
  }
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
    // a provider without a live clock (TheSportsDB) must not wipe ESPN's
    db.prepare(`
      UPDATE matches SET status = 'live', minute = COALESCE(?, CASE WHEN status = 'live' THEN minute END),
        home_score = ?, away_score = ?, result_source = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(ev.minute, ev.homeScore, ev.awayScore, provider, match.id);
    // scorers show up in the match screen while the match is still going
    if (ev.goals?.length) storeGoals(match, ev, home, away);
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
  // the provider's list is the truth: replacing it drops goals that VAR
  // disallowed and fixes corrected minutes/scorers during a live match
  db.transaction(() => {
    db.prepare('DELETE FROM match_events WHERE match_id = ?').run(match.id);
    for (const g of ev.goals) {
      const team = findTeam(g.teamName) || (g.teamName === ev.homeName ? home : away);
      // own goals count for the scoring team's opponent but not for topscorer
      const type = g.ownGoal ? 'own_goal' : g.penalty ? 'penalty' : 'goal';
      ins.run(match.id, type, g.player, team ? team.id : null, g.minute);
    }
  })();
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
  if (dates.length === 0) {
    // line-ups appear ~1h before kickoff, recaps hours after the whistle
    await syncMatchDetails().catch(() => {});
    return { skipped: true, reason: 'geen wedstrijden in venster' };
  }

  let matched = 0;
  try {
    const events = await espnFetchDays(dates);
    for (const ev of events) if (applyEvent(ev, 'espn').matched) matched += 1;
    log('scores', 'espn', true, `${events.length} events, ${matched} gematcht (${dates.join(', ')})`);
    classifyFinals();
    resolveBonusQuestions();
    await syncMatchDetails({ baseline: baselineFrom(events) });
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
  let baseline = new Map();
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
    const days = tournamentDays();
    if (days.length) {
      const events = await espnFetchDays(days);
      let matched = 0;
      for (const ev of events) if (applyEvent(ev, 'espn', { updateKickoff: true }).matched) matched += 1;
      log('fixtures', 'espn', true, `${events.length} events, ${matched} gematcht`);
      baseline = baselineFrom(events);
      ok = true;
    }
  } catch (err) {
    log('fixtures', 'espn', false, err.message);
  }
  classifyFinals();
  resolveBonusQuestions();
  await syncMatchDetails({ backfill: true, baseline });
  return { ok };
}

/** Match days (YYYYMMDD) in the catch-up window: anything unfinished up to a week ahead. */
function tournamentDays() {
  return db.prepare(`
    SELECT DISTINCT date(kickoff_utc) AS d FROM matches
    WHERE datetime(kickoff_utc) <= datetime('now', '+7 days')
      AND (status != 'finished' OR points_calculated = 0)
    ORDER BY d
  `).all().map((r) => r.d.replaceAll('-', ''));
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

// ---------------------------------------------------------------------------
// Match details (stats, timeline, line-ups, commentary, recap)
// ---------------------------------------------------------------------------

/** Hours after kickoff we keep refetching a finished match waiting for its recap. */
export const RECAP_WAIT_HOURS = 8;

export function storeDetails(matchId, provider, details, final = false) {
  stampCommentary(matchId, details);
  db.prepare(`
    INSERT INTO match_details (match_id, provider, data, complete, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(match_id) DO UPDATE SET provider = excluded.provider, data = excluded.data,
      complete = excluded.complete, updated_at = excluded.updated_at
  `).run(matchId, provider, JSON.stringify(details), final ? 1 : 0);
}

/**
 * Give every commentary line the moment we first saw it (`seen`, epoch ms),
 * keeping earlier stamps. Lets the TV mode merge the commentary of several
 * matches into one feed in real order; a match minute alone can't do that.
 */
function stampCommentary(matchId, details) {
  if (!details?.commentary?.length) return;
  let before = new Map();
  try {
    const row = db.prepare('SELECT data FROM match_details WHERE match_id = ?').get(matchId);
    const old = row ? JSON.parse(row.data).commentary || [] : [];
    before = new Map(old.filter((c) => c.seen).map((c) => [`${c.seq}|${c.text}`, c.seen]));
  } catch { /* unreadable old row: stamp everything fresh */ }
  const now = Date.now();
  // a provider may bring its own timestamp (the demo simulator knows when a
  // line "happened" in its time-compressed season); an earlier stamp wins
  for (const c of details.commentary) c.seen = before.get(`${c.seq}|${c.text}`) ?? c.seen ?? now;
}

export function getDetails(matchId) {
  const row = db.prepare('SELECT data, provider, updated_at FROM match_details WHERE match_id = ?').get(matchId);
  if (!row) return null;
  try {
    return { ...JSON.parse(row.data), provider: row.provider, updated_at: row.updated_at };
  } catch {
    return null;
  }
}

/**
 * Which matches need a (re)fetch of their ESPN summary:
 *  - every live match, every poll (stats/commentary move by the minute)
 *  - finished matches until marked complete: the recap article usually
 *    appears some time after the final whistle
 *  - with backfill: also scheduled matches kicking off within 2 hours
 *    (line-ups are published ~1h before kickoff) and any finished match
 *    that never got details (the Pi was off)
 */
export function matchesNeedingDetails({ backfill = false } = {}) {
  return db.prepare(`
    SELECT m.id, m.status, m.kickoff_utc, json_extract(m.provider_ids, '$.espn') AS espn_id,
           d.complete, d.match_id IS NOT NULL AS has_details
    FROM matches m LEFT JOIN match_details d ON d.match_id = m.id
    WHERE json_extract(m.provider_ids, '$.espn') IS NOT NULL
      AND (
        m.status = 'live'
        OR (m.status = 'finished' AND COALESCE(d.complete, 0) = 0
            AND (? = 1 OR datetime(m.kickoff_utc) >= datetime('now', '-${RECAP_WAIT_HOURS + 4} hours')))
        OR (m.status = 'scheduled'
            AND datetime(m.kickoff_utc) <= datetime('now', '+90 minutes')
            AND datetime(m.kickoff_utc) >= datetime('now', '-4 hours'))
      )
    ORDER BY m.kickoff_utc ASC
    LIMIT 24
  `).all(backfill ? 1 : 0);
}

/** ESPN scoreboard events → Map(espnId → baseline details). */
function baselineFrom(events) {
  const map = new Map();
  for (const ev of events) if (ev.details) map.set(String(ev.providerId), ev.details);
  return map;
}

/**
 * Fetch /summary for every match that needs it and merge it over the
 * scoreboard baseline. When /summary fails or comes back empty the baseline
 * is still stored, so the match screen is never blank. The outcome is kept
 * in `details.sync` for the admin diagnostics line.
 */
export async function syncMatchDetails({ backfill = false, fetcher = espnSummary, baseline = new Map() } = {}) {
  let fetched = 0;
  let failed = 0;
  for (const m of matchesNeedingDetails({ backfill })) {
    const base = baseline.get(String(m.espn_id)) || null;
    let summary = null;
    let outcome = 'ok';
    try {
      summary = await fetcher(m.espn_id);
      if (isEmptyDetails(summary)) outcome = 'leeg';
    } catch (err) {
      failed += 1;
      outcome = `fout: ${String(err.message).slice(0, 160)}`;
      if (failed === 1) log('details', 'espn', false, `wedstrijd ${m.id}: ${err.message}`);
    }
    const details = mergeDetails(summary, base);
    if (!details) continue;
    const hoursSinceKickoff = (Date.now() - new Date(m.kickoff_utc).getTime()) / 3600000;
    // stop refetching once the recap is in, or RECAP_WAIT_HOURS after kickoff
    // (also when /summary keeps failing — the scoreboard data is all we'll get)
    const final = m.status === 'finished' && (Boolean(details.article) || hoursSinceKickoff >= RECAP_WAIT_HOURS);
    details.sync = { summary: outcome, scoreboard: Boolean(base), at: new Date().toISOString() };
    storeDetails(m.id, 'espn', details, final);
    fetched += 1;
  }
  if (fetched) log('details', 'espn', true, `${fetched} wedstrijddetail(s) bijgewerkt${failed ? `, ${failed}× summary mislukt (scoreboard-data gebruikt)` : ''}`);
  return { fetched, failed };
}

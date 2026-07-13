import db from '../db/database.js';
import { checkAchievements, checkMatchdayAchievements } from './achievements.js';
import { broadcast } from './notify.js';
import { sendPush } from './push.js';
import { publishRecap } from './sportkrant.js';

export const SCORING = { exact: 5, difference: 3, winner: 2 };

export const STAGE_MULTIPLIERS = {
  league: 1,
  quarterfinal: 1.5,
  semifinal: 2,
  third_place: 2,
  final: 2.5,
};

/**
 * Base points:
 *  - exact score: 5
 *  - correct winner + correct goal difference: 3
 *  - correct winner (or predicted a draw when it was a draw): 2
 * Multiplied by stage multiplier and ×2 when the joker is on this match.
 */
export function calculatePoints(predHome, predAway, actualHome, actualAway, multiplier = 1, joker = false) {
  let base = 0;
  const predDiff = predHome - predAway;
  const actualDiff = actualHome - actualAway;
  const sameWinner = Math.sign(predDiff) === Math.sign(actualDiff);

  if (predHome === actualHome && predAway === actualAway) base = SCORING.exact;
  else if (sameWinner && predDiff === actualDiff) base = SCORING.difference;
  else if (sameWinner) base = SCORING.winner;

  return base * multiplier * (joker ? 2 : 1);
}

/**
 * Recompute points for every prediction on a finished match, then run the
 * follow-ups (achievements, matchday finalization). Idempotent.
 */
export function processMatchResult(matchId, { notify = true } = {}) {
  const match = db.prepare(`
    SELECT m.*, th.name_nl AS home_name, th.flag AS home_flag,
           ta.name_nl AS away_name, ta.flag AS away_flag
    FROM matches m
    JOIN teams th ON th.id = m.home_team_id
    JOIN teams ta ON ta.id = m.away_team_id
    WHERE m.id = ?
  `).get(matchId);
  if (!match || match.status !== 'finished' || match.home_score == null || match.away_score == null) return null;

  const multiplier = STAGE_MULTIPLIERS[match.stage] ?? 1;
  const predictions = db.prepare('SELECT * FROM predictions WHERE match_id = ?').all(matchId);
  const wasCalculated = match.points_calculated === 1;

  const update = db.prepare('UPDATE predictions SET points = ? WHERE id = ?');
  const tx = db.transaction(() => {
    for (const p of predictions) {
      const pts = calculatePoints(
        p.home_goals, p.away_goals,
        match.home_score, match.away_score,
        multiplier, p.is_joker === 1
      );
      update.run(pts, p.id);
    }
    db.prepare("UPDATE matches SET points_calculated = 1, updated_at = datetime('now') WHERE id = ?").run(matchId);
  });
  tx();

  for (const p of predictions) checkAchievements(p.user_id);

  if (notify && !wasCalculated) {
    const title = `${match.home_flag} ${match.home_name} ${match.home_score} - ${match.away_score} ${match.away_name} ${match.away_flag}`;
    broadcast('result', title, 'De punten zijn bijgewerkt. Bekijk de ranglijst!');
    sendPush(null, { title, body: 'Eindstand — de punten zijn bijgewerkt 🏆' }).catch(() => {});
  }

  finalizeMatchdayIfComplete(match.matchday);
  return { matchId, predictions: predictions.length };
}

/**
 * When every match of a matchday is finished: store a leaderboard snapshot
 * (fuel for the rank-movement achievements) and crown the day winner.
 */
export function finalizeMatchdayIfComplete(matchday) {
  const open = db.prepare(`
    SELECT COUNT(*) AS n FROM matches
    WHERE matchday = ? AND stage = 'league' AND (status != 'finished' OR points_calculated = 0)
  `).get(matchday).n;
  if (open > 0) return false;

  const existing = db.prepare('SELECT COUNT(*) AS n FROM matchday_snapshots WHERE matchday = ?').get(matchday).n;
  if (existing > 0) return false; // already finalized

  const rows = db.prepare(`
    SELECT u.id AS user_id,
           COALESCE(tot.pts, 0) + COALESCE(bon.pts, 0) AS total_points,
           COALESCE(md.pts, 0) AS matchday_points
    FROM users u
    LEFT JOIN (
      SELECT user_id, SUM(points) AS pts FROM predictions WHERE points IS NOT NULL GROUP BY user_id
    ) tot ON tot.user_id = u.id
    LEFT JOIN (
      SELECT p.user_id, SUM(p.points) AS pts
      FROM predictions p JOIN matches m ON m.id = p.match_id
      WHERE m.matchday = ? AND p.points IS NOT NULL
      GROUP BY p.user_id
    ) md ON md.user_id = u.id
    LEFT JOIN (
      SELECT user_id, SUM(points) AS pts FROM bonus_answers WHERE points IS NOT NULL GROUP BY user_id
    ) bon ON bon.user_id = u.id
    WHERE u.status = 'active'
    ORDER BY total_points DESC, u.username ASC
  `).all(matchday);

  const ins = db.prepare(
    'INSERT INTO matchday_snapshots (matchday, user_id, rank, total_points, matchday_points) VALUES (?, ?, ?, ?, ?)'
  );
  const tx = db.transaction(() => {
    let rank = 0, prevPts = null, i = 0;
    for (const r of rows) {
      i += 1;
      if (r.total_points !== prevPts) { rank = i; prevPts = r.total_points; }
      ins.run(matchday, r.user_id, rank, r.total_points, r.matchday_points);
    }
  });
  tx();

  checkMatchdayAchievements(matchday);

  // De Sportkrant writes its recap once the snapshots exist
  try {
    publishRecap(matchday);
  } catch (err) {
    console.error('⚠️ Sportkrant mislukt:', err.message);
  }

  const best = rows.filter((r) => r.matchday_points > 0)
    .sort((a, b) => b.matchday_points - a.matchday_points)[0];
  if (best) {
    const user = db.prepare('SELECT display_name FROM users WHERE id = ?').get(best.user_id);
    broadcast(
      'matchday',
      `Speelronde ${matchday} is afgelopen! 🏁`,
      `Dagwinnaar: ${user.display_name} met ${best.matchday_points} punten.`
    );
    sendPush(null, {
      title: `Speelronde ${matchday} is afgelopen! 🏁`,
      body: `Dagwinnaar: ${user.display_name} met ${best.matchday_points} punten. Bekijk de nieuwe ranglijst!`,
    }).catch(() => {});
  }
  return true;
}

// Kristallen Bol 🔮 — personal prediction analytics, computed from scored
// predictions on finished matches only (so nothing leaks about open rounds).
import db from '../db/database.js';
import { calculatePoints, SCORING } from './scoring.js';

export function computeUserStats(userId) {
  const rows = db.prepare(`
    SELECT p.home_goals, p.away_goals, p.points, p.is_joker,
           m.home_score, m.away_score, m.home_team_id, m.away_team_id, m.stage,
           th.name_nl AS home_name, th.flag AS home_flag,
           ta.name_nl AS away_name, ta.flag AS away_flag,
           m.id AS match_id
    FROM predictions p
    JOIN matches m ON m.id = p.match_id
    JOIN teams th ON th.id = m.home_team_id
    JOIN teams ta ON ta.id = m.away_team_id
    WHERE p.user_id = ? AND m.status = 'finished' AND p.points IS NOT NULL
  `).all(userId);

  const classify = (r) => {
    if (r.home_goals === r.home_score && r.away_goals === r.away_score) return 'exact';
    const pd = r.home_goals - r.away_goals;
    const ad = r.home_score - r.away_score;
    if (Math.sign(pd) === Math.sign(ad) && pd === ad) return 'gd';
    if (Math.sign(pd) === Math.sign(ad)) return 'winner';
    return 'miss';
  };

  const counts = { exact: 0, gd: 0, winner: 0, miss: 0 };
  const perTeam = new Map(); // teamId -> {name, flag, points, matches}
  let predictedGoals = 0, actualGoals = 0;
  let predHomeWins = 0, actualHomeWins = 0, predDraws = 0, actualDraws = 0;

  for (const r of rows) {
    counts[classify(r)] += 1;
    predictedGoals += r.home_goals + r.away_goals;
    actualGoals += r.home_score + r.away_score;
    if (r.home_goals > r.away_goals) predHomeWins += 1;
    if (r.home_score > r.away_score) actualHomeWins += 1;
    if (r.home_goals === r.away_goals) predDraws += 1;
    if (r.home_score === r.away_score) actualDraws += 1;

    // base points (without joker) so team affinity isn't skewed by joker luck
    const base = calculatePoints(r.home_goals, r.away_goals, r.home_score, r.away_score, 1, false);
    for (const [teamId, name, flag] of [[r.home_team_id, r.home_name, r.home_flag], [r.away_team_id, r.away_name, r.away_flag]]) {
      if (!perTeam.has(teamId)) perTeam.set(teamId, { name, flag, points: 0, matches: 0 });
      const t = perTeam.get(teamId);
      t.points += base;
      t.matches += 1;
    }
  }

  const teams = [...perTeam.values()]
    .filter((t) => t.matches >= 2)
    .map((t) => ({ ...t, avg: t.points / t.matches }))
    .sort((a, b) => b.avg - a.avg);

  // joker efficiency: extra points earned thanks to the joker
  const jokers = rows.filter((r) => r.is_joker === 1);
  const jokerExtra = jokers.reduce((s, r) => s + r.points / 2, 0); // points are doubled → half is the bonus
  const jokerHits = jokers.filter((r) => r.points > 0).length;

  // best & most painful prediction
  const best = [...rows].sort((a, b) => b.points - a.points)[0] || null;
  const missesEveryoneHad = rows
    .filter((r) => r.points === 0)
    .map((r) => ({
      ...r,
      others_scored: db.prepare(
        'SELECT COUNT(*) AS n FROM predictions WHERE match_id = ? AND user_id != ? AND points > 0'
      ).get(r.match_id, userId).n,
    }))
    .sort((a, b) => b.others_scored - a.others_scored)[0] || null;

  const snaps = db.prepare(
    'SELECT matchday, rank, matchday_points FROM matchday_snapshots WHERE user_id = ? ORDER BY matchday'
  ).all(userId);

  const fmtMatch = (r) => r && {
    fixture: `${r.home_flag} ${r.home_name} ${r.home_score}–${r.away_score} ${r.away_name} ${r.away_flag}`,
    predicted: `${r.home_goals}–${r.away_goals}`,
    points: r.points,
    others_scored: r.others_scored,
  };

  return {
    scored: rows.length,
    counts,
    accuracy: rows.length ? Math.round(((counts.exact + counts.gd + counts.winner) / rows.length) * 100) : 0,
    goals: {
      predicted_avg: rows.length ? +(predictedGoals / rows.length).toFixed(2) : 0,
      actual_avg: rows.length ? +(actualGoals / rows.length).toFixed(2) : 0,
    },
    tendency: {
      pred_home_wins: predHomeWins, actual_home_wins: actualHomeWins,
      pred_draws: predDraws, actual_draws: actualDraws,
    },
    best_team: teams[0] || null,     // jouw klik
    worst_team: teams.length > 1 ? teams[teams.length - 1] : null, // blinde vlek
    joker: { used: jokers.length, hits: jokerHits, extra_points: jokerExtra },
    best_prediction: fmtMatch(best && best.points > 0 ? best : null),
    biggest_miss: fmtMatch(missesEveryoneHad),
    rank_history: snaps,
    max_base_points: SCORING.exact,
  };
}

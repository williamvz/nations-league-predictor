import { Router } from 'express';
import db from '../db/database.js';
import { authenticate } from '../middleware/auth.js';
import { calculatePoints, STAGE_MULTIPLIERS } from '../services/scoring.js';

const router = Router();
router.use(authenticate);

function baseRows() {
  // prediction points and bonus points aggregated separately (no cartesian join)
  return db.prepare(`
    SELECT u.id AS user_id, u.username, u.display_name, u.avatar, u.favorite_team_id,
           t.flag AS favorite_flag,
           COALESCE(pred.pts, 0) AS match_points,
           COALESCE(pred.exact_count, 0) AS exact,
           COALESCE(pred.correct_count, 0) AS correct,
           COALESCE(pred.filled, 0) AS filled,
           COALESCE(bon.pts, 0) AS bonus_points
    FROM users u
    LEFT JOIN teams t ON t.id = u.favorite_team_id
    LEFT JOIN (
      SELECT p.user_id, SUM(p.points) AS pts,
             SUM(CASE WHEN p.home_goals = m.home_score AND p.away_goals = m.away_score
                       AND m.status = 'finished' THEN 1 ELSE 0 END) AS exact_count,
             SUM(CASE WHEN p.points > 0 THEN 1 ELSE 0 END) AS correct_count,
             COUNT(*) AS filled
      FROM predictions p JOIN matches m ON m.id = p.match_id
      GROUP BY p.user_id
    ) pred ON pred.user_id = u.id
    LEFT JOIN (
      SELECT user_id, SUM(points) AS pts FROM bonus_answers WHERE points IS NOT NULL GROUP BY user_id
    ) bon ON bon.user_id = u.id
  `).all();
}

/** Provisional extra points per user from matches that are currently live. */
function livePoints() {
  const live = db.prepare(`
    SELECT m.id, m.stage, m.home_score, m.away_score
    FROM matches m WHERE m.status = 'live' AND m.home_score IS NOT NULL
  `).all();
  if (live.length === 0) return null;

  const perUser = new Map();
  for (const m of live) {
    const preds = db.prepare('SELECT user_id, home_goals, away_goals, is_joker FROM predictions WHERE match_id = ?').all(m.id);
    const mult = STAGE_MULTIPLIERS[m.stage] ?? 1;
    for (const p of preds) {
      const pts = calculatePoints(p.home_goals, p.away_goals, m.home_score, m.away_score, mult, p.is_joker === 1);
      perUser.set(p.user_id, (perUser.get(p.user_id) || 0) + pts);
    }
  }
  return perUser;
}

router.get('/', (req, res) => {
  const rows = baseRows();
  const live = livePoints();
  for (const r of rows) {
    r.total_points = r.match_points + r.bonus_points;
    r.live_points = live ? (live.get(r.user_id) || 0) : 0;
    r.live_total = r.total_points + r.live_points;
  }
  const sortKey = live ? 'live_total' : 'total_points';
  rows.sort((a, b) => b[sortKey] - a[sortKey] || b.exact - a.exact || b.correct - a.correct || a.username.localeCompare(b.username));

  // previous snapshot for rank movement arrows
  const lastMd = db.prepare('SELECT MAX(matchday) AS md FROM matchday_snapshots').get().md;
  const prevRanks = lastMd
    ? new Map(db.prepare('SELECT user_id, rank FROM matchday_snapshots WHERE matchday = ?').all(lastMd).map((s) => [s.user_id, s.rank]))
    : new Map();

  let rank = 0, prev = null;
  const out = rows.map((r, i) => {
    const key = r[sortKey];
    if (key !== prev) { rank = i + 1; prev = key; }
    return { ...r, rank, prev_rank: prevRanks.get(r.user_id) ?? null };
  });
  res.json({ leaderboard: out, is_live: !!live });
});

router.get('/history', (req, res) => {
  const snaps = db.prepare(`
    SELECT s.matchday, s.user_id, s.rank, s.total_points, u.display_name, u.avatar
    FROM matchday_snapshots s JOIN users u ON u.id = s.user_id
    ORDER BY s.matchday ASC, s.rank ASC
  `).all();
  res.json({ history: snaps });
});

router.get('/compare/:otherId', (req, res) => {
  const otherId = Number(req.params.otherId);
  const other = db.prepare('SELECT id, display_name, avatar FROM users WHERE id = ?').get(otherId);
  if (!other) return res.status(404).json({ error: 'Speler niet gevonden' });

  const rows = db.prepare(`
    SELECT m.id AS match_id, m.kickoff_utc, m.status, m.home_score, m.away_score, m.matchday,
           th.flag AS home_flag, th.name_nl AS home_name,
           ta.flag AS away_flag, ta.name_nl AS away_name,
           me.home_goals AS my_home, me.away_goals AS my_away, me.points AS my_points, me.is_joker AS my_joker,
           yo.home_goals AS their_home, yo.away_goals AS their_away, yo.points AS their_points, yo.is_joker AS their_joker
    FROM matches m
    JOIN teams th ON th.id = m.home_team_id
    JOIN teams ta ON ta.id = m.away_team_id
    LEFT JOIN predictions me ON me.match_id = m.id AND me.user_id = ?
    LEFT JOIN predictions yo ON yo.match_id = m.id AND yo.user_id = ?
    WHERE datetime(m.kickoff_utc) <= datetime('now')
    ORDER BY m.kickoff_utc ASC
  `).all(req.user.id, otherId);
  res.json({ other, matches: rows });
});

export default router;

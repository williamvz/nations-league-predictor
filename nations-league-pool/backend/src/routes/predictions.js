import { Router } from 'express';
import db from '../db/database.js';
import { authenticate } from '../middleware/auth.js';
import { checkAchievements } from '../services/achievements.js';

const router = Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT p.match_id, p.home_goals, p.away_goals, p.is_joker, p.points, p.updated_at,
           m.matchday, m.kickoff_utc, m.status, m.home_score, m.away_score,
           th.name_nl AS home_name, th.flag AS home_flag,
           ta.name_nl AS away_name, ta.flag AS away_flag
    FROM predictions p
    JOIN matches m ON m.id = p.match_id
    JOIN teams th ON th.id = m.home_team_id
    JOIN teams ta ON ta.id = m.away_team_id
    WHERE p.user_id = ?
    ORDER BY m.kickoff_utc ASC
  `).all(req.user.id);
  res.json({ predictions: rows });
});

router.get('/summary', (req, res) => {
  const s = db.prepare(`
    SELECT COUNT(*) AS total,
           COUNT(points) AS scored,
           COALESCE(SUM(points), 0) AS points,
           SUM(CASE WHEN points > 0 THEN 1 ELSE 0 END) AS correct,
           SUM(CASE WHEN p.home_goals = m.home_score AND p.away_goals = m.away_score
                     AND m.status = 'finished' THEN 1 ELSE 0 END) AS exact
    FROM predictions p JOIN matches m ON m.id = p.match_id
    WHERE p.user_id = ?
  `).get(req.user.id);
  const bonus = db.prepare(
    'SELECT COALESCE(SUM(points), 0) AS points FROM bonus_answers WHERE user_id = ? AND points IS NOT NULL'
  ).get(req.user.id);
  const open = db.prepare(`
    SELECT COUNT(*) AS n FROM matches m
    WHERE m.status = 'scheduled' AND datetime(m.kickoff_utc) > datetime('now')
      AND NOT EXISTS (SELECT 1 FROM predictions p WHERE p.match_id = m.id AND p.user_id = ?)
  `).get(req.user.id);
  res.json({
    total: s.total, scored: s.scored, correct: s.correct || 0, exact: s.exact || 0,
    match_points: s.points, bonus_points: bonus.points,
    total_points: s.points + bonus.points, still_open: open.n,
  });
});

/** Upsert a prediction. Body: { match_id, home_goals, away_goals, is_joker? } */
router.post('/', (req, res) => {
  const matchId = Number(req.body.match_id);
  const home = Number(req.body.home_goals);
  const away = Number(req.body.away_goals);

  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0 || home > 20 || away > 20) {
    return res.status(400).json({ error: 'Ongeldige score (0-20)' });
  }

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!match) return res.status(404).json({ error: 'Wedstrijd niet gevonden' });
  if (new Date(match.kickoff_utc).getTime() <= Date.now() || match.status !== 'scheduled') {
    return res.status(403).json({ error: 'Deze wedstrijd is al begonnen — voorspellen kan niet meer' });
  }

  const wantsJoker = req.body.is_joker === true || req.body.is_joker === 1;
  const tx = db.transaction(() => {
    if (wantsJoker) {
      // one joker per matchday: steal it from a not-yet-started match if needed
      const existing = db.prepare(`
        SELECT p.id, m.kickoff_utc FROM predictions p JOIN matches m ON m.id = p.match_id
        WHERE p.user_id = ? AND m.matchday = ? AND p.is_joker = 1 AND p.match_id != ?
      `).get(req.user.id, match.matchday, matchId);
      if (existing) {
        if (new Date(existing.kickoff_utc).getTime() <= Date.now()) {
          throw Object.assign(new Error('Je joker staat al op een gestarte wedstrijd in deze speelronde'), { status: 409 });
        }
        db.prepare('UPDATE predictions SET is_joker = 0 WHERE id = ?').run(existing.id);
      }
    }
    db.prepare(`
      INSERT INTO predictions (user_id, match_id, home_goals, away_goals, is_joker)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, match_id) DO UPDATE SET
        home_goals = excluded.home_goals,
        away_goals = excluded.away_goals,
        is_joker = excluded.is_joker,
        updated_at = datetime('now')
    `).run(req.user.id, matchId, home, away, wantsJoker ? 1 : 0);
  });

  try {
    tx();
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  checkAchievements(req.user.id);
  const prediction = db.prepare(
    'SELECT match_id, home_goals, away_goals, is_joker, points FROM predictions WHERE user_id = ? AND match_id = ?'
  ).get(req.user.id, matchId);
  res.json({ prediction });
});

export default router;

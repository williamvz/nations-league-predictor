import { Router } from 'express';
import db from '../db/database.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

const MATCH_SELECT = `
  SELECT m.id, m.matchday, m.group_name, m.stage, m.kickoff_utc, m.kickoff_confirmed,
         m.status, m.minute, m.home_score, m.away_score, m.result_source,
         th.id AS home_team_id, th.code AS home_code, th.name_nl AS home_name, th.flag AS home_flag,
         ta.id AS away_team_id, ta.code AS away_code, ta.name_nl AS away_name, ta.flag AS away_flag
  FROM matches m
  JOIN teams th ON th.id = m.home_team_id
  JOIN teams ta ON ta.id = m.away_team_id
`;

function decorate(match, userId) {
  const locked = new Date(match.kickoff_utc).getTime() <= Date.now();
  const out = { ...match, is_locked: locked };
  if (userId) {
    out.prediction = db.prepare(
      'SELECT home_goals, away_goals, is_joker, points FROM predictions WHERE user_id = ? AND match_id = ?'
    ).get(userId, match.id) || null;
  }
  // community stats only after kickoff (no peeking!)
  if (locked) {
    out.community = db.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN home_goals > away_goals THEN 1 ELSE 0 END) AS home_wins,
             SUM(CASE WHEN home_goals = away_goals THEN 1 ELSE 0 END) AS draws,
             SUM(CASE WHEN home_goals < away_goals THEN 1 ELSE 0 END) AS away_wins
      FROM predictions WHERE match_id = ?
    `).get(match.id);
  }
  return out;
}

router.get('/', authenticate, (req, res) => {
  const matches = db.prepare(`${MATCH_SELECT} ORDER BY m.kickoff_utc ASC, m.id ASC`).all();
  res.json({ matches: matches.map((m) => decorate(m, req.user.id)) });
});

router.get('/live', authenticate, (req, res) => {
  const matches = db.prepare(`${MATCH_SELECT} WHERE m.status = 'live' ORDER BY m.kickoff_utc ASC`).all();
  res.json({ matches: matches.map((m) => decorate(m, req.user.id)) });
});

router.get('/upcoming', authenticate, (req, res) => {
  const matches = db.prepare(`
    ${MATCH_SELECT}
    WHERE m.status = 'scheduled' AND datetime(m.kickoff_utc) > datetime('now')
    ORDER BY m.kickoff_utc ASC LIMIT 8
  `).all();
  res.json({ matches: matches.map((m) => decorate(m, req.user.id)) });
});

router.get('/:id', authenticate, (req, res) => {
  const match = db.prepare(`${MATCH_SELECT} WHERE m.id = ?`).get(req.params.id);
  if (!match) return res.status(404).json({ error: 'Wedstrijd niet gevonden' });
  const out = decorate(match, req.user.id);
  out.goals = db.prepare(`
    SELECT e.player_name, e.minute, e.event_type, e.team_id, t.code AS team_code
    FROM match_events e LEFT JOIN teams t ON t.id = e.team_id
    WHERE e.match_id = ? ORDER BY e.id ASC
  `).all(match.id);
  // everyone's predictions become visible once the match has started
  if (out.is_locked) {
    out.all_predictions = db.prepare(`
      SELECT u.display_name, u.avatar, p.home_goals, p.away_goals, p.is_joker, p.points
      FROM predictions p JOIN users u ON u.id = p.user_id
      WHERE p.match_id = ?
      ORDER BY p.points DESC NULLS LAST, u.display_name ASC
    `).all(match.id);
  }
  res.json({ match: out });
});

export default router;

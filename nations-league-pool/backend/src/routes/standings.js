import { Router } from 'express';
import db from '../db/database.js';
import { authenticate } from '../middleware/auth.js';
import { allStandings, teamInsights } from '../services/standings.js';

const router = Router();
router.use(authenticate);

router.get('/', (req, res) => {
  res.json({ groups: allStandings({ includeLive: true }) });
});

router.get('/scorers', (req, res) => {
  const scorers = db.prepare(`
    SELECT s.player_name, s.goals, s.source, t.code AS team_code, t.name_nl AS team_name, t.flag AS team_flag
    FROM scorers s LEFT JOIN teams t ON t.id = s.team_id
    ORDER BY s.goals DESC, s.player_name ASC
    LIMIT 30
  `).all();
  res.json({ scorers });
});

router.get('/team/:id', (req, res) => {
  const insights = teamInsights(Number(req.params.id));
  if (!insights) return res.status(404).json({ error: 'Land niet gevonden' });
  res.json(insights);
});

export default router;

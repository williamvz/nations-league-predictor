import { Router } from 'express';
import db from '../db/database.js';
import { authenticate } from '../middleware/auth.js';
import { computeUserStats } from '../services/stats.js';

const router = Router();
router.use(authenticate);

// De Sportkrant: all published matchday recaps, newest first
router.get('/recaps', (req, res) => {
  const recaps = db.prepare('SELECT * FROM recaps ORDER BY matchday DESC').all();
  res.json({ recaps });
});

// Kristallen Bol: personal stats (own by default, any player by id — stats
// only cover finished matches, so nothing about open rounds can leak)
router.get('/stats/:userId?', (req, res) => {
  const userId = req.params.userId ? Number(req.params.userId) : req.user.id;
  const user = db.prepare(
    "SELECT id, display_name, avatar FROM users WHERE id = ? AND status = 'active'"
  ).get(userId);
  if (!user) return res.status(404).json({ error: 'Speler niet gevonden' });
  res.json({ user, stats: computeUserStats(userId) });
});

export default router;

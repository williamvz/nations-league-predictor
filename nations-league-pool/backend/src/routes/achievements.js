import { Router } from 'express';
import db from '../db/database.js';
import { authenticate } from '../middleware/auth.js';
import { ACHIEVEMENTS } from '../services/achievements.js';

const router = Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const userCount = db.prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'active'").get().n || 1;
  const unlockedAll = db.prepare(
    'SELECT achievement_key, COUNT(*) AS n FROM achievements GROUP BY achievement_key'
  ).all();
  const countByKey = new Map(unlockedAll.map((r) => [r.achievement_key, r.n]));
  const mine = new Map(
    db.prepare('SELECT achievement_key, unlocked_at FROM achievements WHERE user_id = ?')
      .all(req.user.id).map((r) => [r.achievement_key, r.unlocked_at])
  );

  const list = ACHIEVEMENTS.map((a) => ({
    ...a,
    unlocked_at: mine.get(a.key) || null,
    unlock_percentage: Math.round(((countByKey.get(a.key) || 0) / userCount) * 100),
  }));
  res.json({ achievements: list });
});

/** Newly unlocked achievements the client hasn't shown a popup for yet. */
router.get('/unseen', (req, res) => {
  const rows = db.prepare(
    'SELECT achievement_key, unlocked_at FROM achievements WHERE user_id = ? AND seen = 0'
  ).all(req.user.id);
  const detailed = rows
    .map((r) => ({ ...ACHIEVEMENTS.find((a) => a.key === r.achievement_key), unlocked_at: r.unlocked_at }))
    .filter((a) => a.key);
  res.json({ achievements: detailed });
});

router.post('/seen', (req, res) => {
  db.prepare('UPDATE achievements SET seen = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

export default router;

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { listForUser, markRead, markAllRead } from '../services/notify.js';

const router = Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const notifications = listForUser(req.user.id);
  res.json({
    notifications,
    unread: notifications.filter((n) => !n.is_read).length,
  });
});

router.put('/:id/read', (req, res) => {
  markRead(req.user.id, Number(req.params.id));
  res.json({ ok: true });
});

router.put('/read-all', (req, res) => {
  markAllRead(req.user.id);
  res.json({ ok: true });
});

export default router;

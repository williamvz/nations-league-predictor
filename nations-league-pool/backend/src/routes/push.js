import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getPublicKey, saveSubscription, removeSubscription, subscriptionCount, sendPush } from '../services/push.js';

const router = Router();
router.use(authenticate);

router.get('/key', (req, res) => {
  res.json({ key: getPublicKey(), subscribed_devices: subscriptionCount(req.user.id) });
});

router.post('/subscribe', (req, res) => {
  const sub = req.body.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh) return res.status(400).json({ error: 'Ongeldig abonnement' });
  saveSubscription(req.user.id, sub);
  res.json({ ok: true });
});

router.post('/unsubscribe', (req, res) => {
  if (req.body.endpoint) removeSubscription(req.user.id, String(req.body.endpoint));
  res.json({ ok: true });
});

// send yourself a test push to confirm the whole chain works
router.post('/test', async (req, res) => {
  const result = await sendPush([req.user.id], {
    title: '🏆 Nations League Pool',
    body: 'Pushmeldingen werken op dit apparaat!',
  });
  res.json(result);
});

export default router;

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET ontbreekt. Zet deze in de add-on configuratie of .env.');
  process.exit(1);
}

const { seed } = await import('./db/seed.js');
seed();

const authRoutes = (await import('./routes/auth.js')).default;
const matchRoutes = (await import('./routes/matches.js')).default;
const predictionRoutes = (await import('./routes/predictions.js')).default;
const leaderboardRoutes = (await import('./routes/leaderboard.js')).default;
const standingsRoutes = (await import('./routes/standings.js')).default;
const bonusRoutes = (await import('./routes/bonus.js')).default;
const achievementRoutes = (await import('./routes/achievements.js')).default;
const notificationRoutes = (await import('./routes/notifications.js')).default;
const adminRoutes = (await import('./routes/admin.js')).default;
const { startScheduler } = await import('./sync/scheduler.js');

const app = express();
app.use(cors());
app.use(express.json());
app.set('trust proxy', true); // Home Assistant ingress / reverse proxy

app.use('/api/auth', authRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/standings', standingsRoutes);
app.use('/api/bonus', bonusRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// registration availability (login page shows/hides the register link)
app.get('/api/meta', async (req, res) => {
  const { getSetting } = await import('./db/database.js');
  res.json({ registration_open: Boolean(getSetting('invite_code', process.env.INVITE_CODE || '')) });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Onbekend endpoint' }));

// Static frontend. All asset URLs in the build are RELATIVE so the app works
// unmodified behind Home Assistant ingress (/api/hassio_ingress/<token>/).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

const PORT = process.env.PORT || 8099;
app.listen(PORT, () => {
  console.log(`🏆 Nations League Pool draait op poort ${PORT}`);
  startScheduler();
});

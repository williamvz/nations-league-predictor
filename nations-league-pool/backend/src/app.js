// Express app factory, separate from server.js so tests can mount the full
// API on an ephemeral port without the scheduler or a fixed port.
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSetting } from './db/database.js';

import authRoutes from './routes/auth.js';
import matchRoutes from './routes/matches.js';
import predictionRoutes from './routes/predictions.js';
import leaderboardRoutes from './routes/leaderboard.js';
import standingsRoutes from './routes/standings.js';
import bonusRoutes from './routes/bonus.js';
import achievementRoutes from './routes/achievements.js';
import notificationRoutes from './routes/notifications.js';
import adminRoutes from './routes/admin.js';
import pushRoutes from './routes/push.js';
import extrasRoutes from './routes/extras.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.set('trust proxy', true); // Home Assistant ingress / reverse proxy

  // public endpoints go before the routers: extras.js authenticates
  // everything under /api, which used to swallow these two with a 401
  app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

  // registration is always open (new accounts await admin approval); a correct
  // invite code skips the approval queue
  app.get('/api/meta', (req, res) => {
    res.json({
      registration_open: true,
      has_invite_code: Boolean(getSetting('invite_code', process.env.INVITE_CODE || '')),
      demo_mode: process.env.DEMO_MODE === '1',
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/matches', matchRoutes);
  app.use('/api/predictions', predictionRoutes);
  app.use('/api/leaderboard', leaderboardRoutes);
  app.use('/api/standings', standingsRoutes);
  app.use('/api/bonus', bonusRoutes);
  app.use('/api/achievements', achievementRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/push', pushRoutes);
  app.use('/api', extrasRoutes);

  app.use('/api', (req, res) => res.status(404).json({ error: 'Onbekend endpoint' }));

  // Static frontend. All asset URLs in the build are RELATIVE so the app works
  // unmodified behind Home Assistant ingress (/api/hassio_ingress/<token>/).
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir));
  app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

  return app;
}

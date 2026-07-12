import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db, { getSetting, setSetting } from '../db/database.js';
import { authenticate, requireAdmin, invalidateSessions } from '../middleware/auth.js';
import { processMatchResult } from '../services/scoring.js';
import { broadcast, notifyUser } from '../services/notify.js';
import { syncScores, syncFixtures, recomputeScorers } from '../sync/engine.js';
import { resolveBonusQuestions } from '../services/bonus.js';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/dashboard', (req, res) => {
  const users = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const matches = db.prepare("SELECT COUNT(*) AS n, SUM(CASE WHEN status='finished' THEN 1 ELSE 0 END) AS finished FROM matches").get();
  const predictions = db.prepare('SELECT COUNT(*) AS n FROM predictions').get().n;
  const nextMatches = db.prepare(`
    SELECT m.id, m.kickoff_utc, th.name_nl AS home_name, ta.name_nl AS away_name,
           (SELECT COUNT(*) FROM predictions p WHERE p.match_id = m.id) AS prediction_count
    FROM matches m
    JOIN teams th ON th.id = m.home_team_id
    JOIN teams ta ON ta.id = m.away_team_id
    WHERE m.status = 'scheduled' AND datetime(m.kickoff_utc) > datetime('now')
    ORDER BY m.kickoff_utc ASC LIMIT 8
  `).all();
  const lastSync = db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT 1').get();
  const pending = db.prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'pending'").get().n;
  res.json({
    users, pending_users: pending, matches: matches.n, finished: matches.finished || 0, predictions,
    next_matches: nextMatches, last_sync: lastSync || null,
    sync_enabled: getSetting('sync_enabled', '1') === '1',
    invite_code: getSetting('invite_code', process.env.INVITE_CODE || ''),
  });
});

// ---------- users ----------

router.get('/users', (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar, u.is_admin, u.status, u.created_at, u.last_login_at,
           (SELECT COUNT(*) FROM predictions p WHERE p.user_id = u.id) AS prediction_count
    FROM users u
    ORDER BY CASE u.status WHEN 'pending' THEN 0 ELSE 1 END, u.username ASC
  `).all();
  res.json({ users });
});

router.post('/users/:id/approve', (req, res) => {
  const userId = Number(req.params.id);
  const user = db.prepare("SELECT * FROM users WHERE id = ? AND status = 'pending'").get(userId);
  if (!user) return res.status(404).json({ error: 'Geen openstaande aanmelding gevonden' });
  db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(userId);
  notifyUser(userId, 'registration', 'Je aanmelding is goedgekeurd! 🎉',
    'Welkom bij de pool. Vul snel je voorspellingen en bonusvragen in!');
  res.json({ ok: true });
});

router.post('/users/:id/reject', (req, res) => {
  const userId = Number(req.params.id);
  // rejecting simply removes the pending account, so the username is free again
  const info = db.prepare("DELETE FROM users WHERE id = ? AND status = 'pending'").run(userId);
  if (info.changes === 0) return res.status(404).json({ error: 'Geen openstaande aanmelding gevonden' });
  res.json({ ok: true });
});

router.post('/users', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (!/^[\w.-]{3,20}$/.test(username)) return res.status(400).json({ error: 'Gebruikersnaam: 3-20 tekens' });
  if (password.length < 6) return res.status(400).json({ error: 'Wachtwoord: minimaal 6 tekens' });
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    return res.status(409).json({ error: 'Gebruikersnaam bestaat al' });
  }
  const info = db.prepare(`
    INSERT INTO users (username, display_name, password_hash, must_change_password)
    VALUES (?, ?, ?, 1)
  `).run(username, String(req.body.display_name || username).slice(0, 30), bcrypt.hashSync(password, 10));
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/users/:id', (req, res) => {
  const userId = Number(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Gebruiker niet gevonden' });

  if (req.body.password) {
    if (String(req.body.password).length < 6) return res.status(400).json({ error: 'Wachtwoord te kort' });
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?')
      .run(bcrypt.hashSync(String(req.body.password), 10), userId);
    invalidateSessions(userId);
  }
  if (req.body.is_admin !== undefined) {
    const makeAdmin = req.body.is_admin ? 1 : 0;
    if (!makeAdmin) {
      const admins = db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1').get().n;
      if (admins <= 1 && user.is_admin) return res.status(400).json({ error: 'Er moet minstens één beheerder blijven' });
    }
    db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(makeAdmin, userId);
  }
  res.json({ ok: true });
});

router.delete('/users/:id', (req, res) => {
  const userId = Number(req.params.id);
  if (userId === req.user.id) return res.status(400).json({ error: 'Je kunt jezelf niet verwijderen' });
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  if (info.changes === 0) return res.status(404).json({ error: 'Gebruiker niet gevonden' });
  res.json({ ok: true });
});

// ---------- matches (manual override, normally unnecessary) ----------

router.put('/matches/:id/result', (req, res) => {
  const matchId = Number(req.params.id);
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!match) return res.status(404).json({ error: 'Wedstrijd niet gevonden' });

  const home = Number(req.body.home_score);
  const away = Number(req.body.away_score);
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
    return res.status(400).json({ error: 'Ongeldige uitslag' });
  }
  db.prepare(`
    UPDATE matches SET status = 'finished', home_score = ?, away_score = ?, minute = NULL,
      result_source = 'manual', points_calculated = 0, updated_at = datetime('now')
    WHERE id = ?
  `).run(home, away, matchId);
  processMatchResult(matchId);
  resolveBonusQuestions();
  res.json({ ok: true });
});

router.put('/matches/:id/reset', (req, res) => {
  const matchId = Number(req.params.id);
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE matches SET status = 'scheduled', home_score = NULL, away_score = NULL,
        minute = NULL, result_source = NULL, points_calculated = 0, updated_at = datetime('now')
      WHERE id = ?
    `).run(matchId);
    db.prepare('UPDATE predictions SET points = NULL WHERE match_id = ?').run(matchId);
    db.prepare('DELETE FROM match_events WHERE match_id = ?').run(matchId);
  });
  tx();
  recomputeScorers();
  res.json({ ok: true });
});

// ---------- scorers (manual fallback) ----------

router.post('/scorers', (req, res) => {
  const name = String(req.body.player_name || '').trim();
  const goals = Number(req.body.goals);
  const teamId = req.body.team_id ? Number(req.body.team_id) : null;
  if (name.length < 2 || !Number.isInteger(goals) || goals < 0) {
    return res.status(400).json({ error: 'Ongeldige invoer' });
  }
  db.prepare(`
    INSERT INTO scorers (player_name, team_id, goals, source) VALUES (?, ?, ?, 'manual')
    ON CONFLICT(player_name, team_id) DO UPDATE SET goals = excluded.goals, source = 'manual', updated_at = datetime('now')
  `).run(name, teamId, goals);
  res.json({ ok: true });
});

// ---------- sync & settings ----------

router.get('/sync/log', (req, res) => {
  const log = db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT 50').all();
  res.json({ log, sync_enabled: getSetting('sync_enabled', '1') === '1' });
});

router.post('/sync/run', async (req, res) => {
  const fixtures = await syncFixtures();
  const scores = await syncScores();
  res.json({ fixtures, scores });
});

router.put('/settings', (req, res) => {
  if (req.body.sync_enabled !== undefined) setSetting('sync_enabled', req.body.sync_enabled ? '1' : '0');
  if (req.body.invite_code !== undefined) setSetting('invite_code', String(req.body.invite_code).trim());
  res.json({ ok: true });
});

router.post('/broadcast', (req, res) => {
  const title = String(req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Titel is verplicht' });
  broadcast('admin', title, String(req.body.body || '').trim());
  res.json({ ok: true });
});

export default router;

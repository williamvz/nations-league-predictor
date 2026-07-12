import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db, { getSetting } from '../db/database.js';
import { signToken, authenticate, invalidateSessions } from '../middleware/auth.js';
import { notifyUser } from '../services/notify.js';
import { notifyHomeAssistant } from '../services/ha.js';

const router = Router();

const PUBLIC_USER = 'id, username, display_name, is_admin, avatar, favorite_team_id, must_change_password';

function sanitizeUsername(name) {
  return String(name || '').trim();
}

router.post('/login', (req, res) => {
  const username = sanitizeUsername(req.body.username);
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Onjuiste gebruikersnaam of wachtwoord' });
  }
  if (user.status === 'pending') {
    return res.status(403).json({ error: 'Je aanmelding wacht nog op goedkeuring door de beheerder ⏳' });
  }
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
  const publicUser = db.prepare(`SELECT ${PUBLIC_USER} FROM users WHERE id = ?`).get(user.id);
  res.json({ token: signToken(user), user: publicUser });
});

// Open self-registration. New accounts start as 'pending' and must be
// approved by an admin in the app. A correct invite code (if configured)
// skips the approval queue.
router.post('/register', (req, res) => {
  const username = sanitizeUsername(req.body.username);
  const password = String(req.body.password || '');
  if (!/^[\w.-]{3,20}$/.test(username)) {
    return res.status(400).json({ error: 'Gebruikersnaam: 3-20 tekens, alleen letters/cijfers/._-' });
  }
  if (password.length < 6) return res.status(400).json({ error: 'Wachtwoord: minimaal 6 tekens' });
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    return res.status(409).json({ error: 'Deze gebruikersnaam is al bezet' });
  }

  const inviteCode = getSetting('invite_code', process.env.INVITE_CODE || '');
  const codeGiven = String(req.body.invite_code || '').trim();
  if (codeGiven && (!inviteCode || codeGiven.toLowerCase() !== inviteCode.trim().toLowerCase())) {
    return res.status(403).json({ error: 'Onjuiste uitnodigingscode (laat leeg om zonder code aan te melden)' });
  }
  const autoApproved = Boolean(inviteCode && codeGiven);

  const displayName = sanitizeUsername(req.body.display_name) || username;
  const info = db.prepare(
    'INSERT INTO users (username, display_name, password_hash, avatar, status) VALUES (?, ?, ?, ?, ?)'
  ).run(username, displayName.slice(0, 30), bcrypt.hashSync(password, 10), '⚽', autoApproved ? 'active' : 'pending');

  if (autoApproved) {
    const user = db.prepare(`SELECT ${PUBLIC_USER} FROM users WHERE id = ?`).get(info.lastInsertRowid);
    return res.status(201).json({ token: signToken(user), user });
  }

  // heads-up for every admin: in-app bell (actionable) + push via Home Assistant
  const admins = db.prepare("SELECT id FROM users WHERE is_admin = 1 AND status = 'active'").all();
  for (const a of admins) {
    notifyUser(a.id, 'registration', `Nieuwe aanmelding: ${displayName} (@${username}) ⏳`,
      'Keur de aanmelding direct hieronder goed, of via Beheer → Gebruikers.',
      { pending_user_id: info.lastInsertRowid, username });
  }
  notifyHomeAssistant('⚽ Nations League Pool',
    `Nieuwe aanmelding van ${displayName} (@${username}) wacht op goedkeuring.`)
    .catch(() => {});
  import('../services/push.js').then(({ sendPush, adminUserIds }) =>
    sendPush(adminUserIds(), {
      title: '⏳ Nieuwe aanmelding',
      body: `${displayName} (@${username}) wacht op goedkeuring.`,
    })
  ).catch(() => {});
  res.status(201).json({ pending: true, message: 'Aanmelding ontvangen! Zodra de beheerder je goedkeurt kun je inloggen.' });
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

router.put('/me', authenticate, (req, res) => {
  const { avatar, display_name, favorite_team_id } = req.body;
  if (avatar !== undefined) {
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(String(avatar).slice(0, 8), req.user.id);
  }
  if (display_name !== undefined) {
    const name = sanitizeUsername(display_name);
    if (name.length < 2) return res.status(400).json({ error: 'Naam te kort' });
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name.slice(0, 30), req.user.id);
  }
  if (favorite_team_id !== undefined) {
    const teamId = favorite_team_id === null ? null : Number(favorite_team_id);
    if (teamId !== null && !db.prepare('SELECT id FROM teams WHERE id = ?').get(teamId)) {
      return res.status(400).json({ error: 'Onbekend land' });
    }
    db.prepare('UPDATE users SET favorite_team_id = ? WHERE id = ?').run(teamId, req.user.id);
  }
  res.json({ user: db.prepare(`SELECT ${PUBLIC_USER} FROM users WHERE id = ?`).get(req.user.id) });
});

router.put('/password', authenticate, (req, res) => {
  const current = String(req.body.current_password || '');
  const next = String(req.body.new_password || '');
  if (next.length < 6) return res.status(400).json({ error: 'Nieuw wachtwoord: minimaal 6 tekens' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current, user.password_hash)) {
    return res.status(401).json({ error: 'Huidig wachtwoord is onjuist' });
  }
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
    .run(bcrypt.hashSync(next, 10), req.user.id);
  invalidateSessions(req.user.id);
  res.json({ ok: true, token: signToken(user) });
});

export default router;

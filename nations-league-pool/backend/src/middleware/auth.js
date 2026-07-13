import jwt from 'jsonwebtoken';
import db from '../db/database.js';

const JWT_SECRET = process.env.JWT_SECRET;

export function signToken(user) {
  return jwt.sign({ userId: user.id }, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '90d',
  });
}

export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Niet ingelogd' });

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Sessie verlopen, log opnieuw in' });
  }

  const user = db
    .prepare('SELECT id, username, display_name, is_admin, status, avatar, favorite_team_id, must_change_password, language FROM users WHERE id = ?')
    .get(payload.userId);
  if (!user) return res.status(401).json({ error: 'Gebruiker bestaat niet meer' });
  if (user.status !== 'active') {
    return res.status(401).json({ error: 'Je account wacht op goedkeuring door de beheerder' });
  }

  const validAfter = db.prepare('SELECT value FROM settings WHERE key = ?').get(`tokens_valid_after_${user.id}`);
  if (validAfter && payload.iat < Number(validAfter.value)) {
    return res.status(401).json({ error: 'Sessie beëindigd, log opnieuw in' });
  }

  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Alleen voor beheerders' });
  next();
}

/** Invalidate all existing JWTs for a user (e.g. after password reset). */
export function invalidateSessions(userId) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(`tokens_valid_after_${userId}`, String(Math.floor(Date.now() / 1000)));
}

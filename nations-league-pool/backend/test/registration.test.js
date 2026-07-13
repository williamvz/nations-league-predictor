// Registration + admin approval flow against a live server instance.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nlpool-reg-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret';
process.env.ADMIN_USERNAME = 'william';
process.env.ADMIN_PASSWORD = 'admin-pw-123';
delete process.env.INVITE_CODE;

const db = (await import('../src/db/database.js')).default;
const { seed } = await import('../src/db/seed.js');
seed();

// exercise the route handlers through a real express app (no scheduler)
const express = (await import('express')).default;
const authRoutes = (await import('../src/routes/auth.js')).default;
const adminRoutes = (await import('../src/routes/admin.js')).default;
const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;

async function call(path, method = 'GET', body, token) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

test('register → pending → cannot log in → approve → can log in', async (t) => {
  t.after(() => server.close());

  // open registration, no invite code
  const reg = await call('/auth/register', 'POST', { username: 'pepijn', password: 'geheim123', display_name: 'Pepijn' });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.pending, true);
  assert.equal(reg.data.token, undefined);

  // login blocked while pending
  const blocked = await call('/auth/login', 'POST', { username: 'pepijn', password: 'geheim123' });
  assert.equal(blocked.status, 403);
  assert.match(blocked.data.error, /goedkeuring/);

  // admin sees the pending registration + got a notification
  const adminLogin = await call('/auth/login', 'POST', { username: 'william', password: 'admin-pw-123' });
  assert.equal(adminLogin.status, 200);
  const adminToken = adminLogin.data.token;

  const users = await call('/admin/users', 'GET', undefined, adminToken);
  const pending = users.data.users.find((u) => u.username === 'pepijn');
  assert.equal(pending.status, 'pending');
  const adminId = adminLogin.data.user.id;
  const notif = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'registration'").get(adminId);
  assert.ok(notif, 'admin received registration notification');

  // approve → user can log in
  const approve = await call(`/admin/users/${pending.id}/approve`, 'POST', undefined, adminToken);
  assert.equal(approve.status, 200);
  const login = await call('/auth/login', 'POST', { username: 'pepijn', password: 'geheim123' });
  assert.equal(login.status, 200);
  assert.ok(login.data.token);

  // reject flow: another registration, reject frees the username
  const reg2 = await call('/auth/register', 'POST', { username: 'grapjas', password: 'zomaar123' });
  assert.equal(reg2.status, 201);
  const users2 = await call('/admin/users', 'GET', undefined, adminToken);
  const p2 = users2.data.users.find((u) => u.username === 'grapjas');
  const reject = await call(`/admin/users/${p2.id}/reject`, 'POST', undefined, adminToken);
  assert.equal(reject.status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE username = 'grapjas'").get().n, 0);

  // invite code fast-pass: set a code, register with it → immediate token
  const { setSetting } = await import('../src/db/database.js');
  setSetting('invite_code', 'oranje');
  const fast = await call('/auth/register', 'POST', { username: 'kees2', password: 'geheim123', invite_code: 'ORANJE' });
  assert.equal(fast.status, 201);
  assert.ok(fast.data.token, 'invite code skips approval');

  // wrong code is rejected outright
  const wrong = await call('/auth/register', 'POST', { username: 'foutje', password: 'geheim123', invite_code: 'verkeerd' });
  assert.equal(wrong.status, 403);
});

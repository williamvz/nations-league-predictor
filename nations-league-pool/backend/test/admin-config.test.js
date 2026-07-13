// Admin account managed via add-on configuration (ADMIN_USERNAME /
// ADMIN_PASSWORD): bootstrap, password enforcement across restarts,
// rename behavior, and upgrade safety for databases with an existing admin.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import bcrypt from 'bcryptjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nlpool-admincfg-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret';
process.env.ADMIN_USERNAME = 'papa';
process.env.ADMIN_PASSWORD = 'geheim-123';

const db = (await import('../src/db/database.js')).default;
const { seed } = await import('../src/db/seed.js');

test('configured admin_username is bootstrapped', () => {
  seed();
  const admin = db.prepare("SELECT * FROM users WHERE username = 'papa'").get();
  assert.ok(admin);
  assert.equal(admin.is_admin, 1);
  assert.equal(admin.must_change_password, 0, 'configured password is not flagged temporary');
  assert.ok(bcrypt.compareSync('geheim-123', admin.password_hash));
});

test('config password is enforced on restart (recovery path)', () => {
  // someone changed it in the app...
  db.prepare('UPDATE users SET password_hash = ? WHERE username = ?')
    .run(bcrypt.hashSync('anders-456', 10), 'papa');
  // ...but the config still says geheim-123 → restart restores it
  seed();
  const admin = db.prepare("SELECT * FROM users WHERE username = 'papa'").get();
  assert.ok(bcrypt.compareSync('geheim-123', admin.password_hash));

  // with the config password removed, in-app management is left alone
  process.env.ADMIN_PASSWORD = '';
  db.prepare('UPDATE users SET password_hash = ? WHERE username = ?')
    .run(bcrypt.hashSync('anders-456', 10), 'papa');
  seed();
  assert.ok(bcrypt.compareSync('anders-456',
    db.prepare("SELECT password_hash FROM users WHERE username = 'papa'").get().password_hash));
});

test('renaming admin_username bootstraps an extra admin, keeps the old one', () => {
  process.env.ADMIN_USERNAME = 'mama';
  process.env.ADMIN_PASSWORD = 'nog-geheimer-789';
  seed();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1').get().n, 2);
  assert.ok(db.prepare("SELECT 1 FROM users WHERE username = 'mama' AND is_admin = 1").get());
  assert.ok(db.prepare("SELECT 1 FROM users WHERE username = 'papa' AND is_admin = 1").get());
});

test('upgrade safety: unset admin_username never invents a second admin', () => {
  delete process.env.ADMIN_USERNAME;
  process.env.ADMIN_PASSWORD = '';
  const before = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  seed();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, before, 'no new account');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE username = 'admin'").get().n, 0);
});

test('demoted configured admin is re-promoted at start', () => {
  process.env.ADMIN_USERNAME = 'papa';
  db.prepare("UPDATE users SET is_admin = 0 WHERE username = 'papa'").run();
  seed();
  assert.equal(db.prepare("SELECT is_admin FROM users WHERE username = 'papa'").get().is_admin, 1);
});

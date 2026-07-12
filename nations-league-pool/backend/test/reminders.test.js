import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nlpool-rem-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret';
process.env.ADMIN_PASSWORD = 'admin-pw-123';

const db = (await import('../src/db/database.js')).default;
const { seed } = await import('../src/db/seed.js');
seed();
const { checkMatchdayReminders } = await import('../src/services/reminders.js');

test('24h reminder fires once for the upcoming matchday', () => {
  // move matchday 1 to ~20 hours from now
  const soon = new Date(Date.now() + 20 * 3600 * 1000).toISOString();
  db.prepare("UPDATE matches SET kickoff_utc = ? WHERE matchday = 1").run(soon);

  checkMatchdayReminders();
  const broadcasts = db.prepare(
    "SELECT COUNT(*) AS n FROM notifications WHERE type = 'reminder' AND title LIKE '%Speelronde 1%'"
  ).get().n;
  assert.equal(broadcasts, 1, 'one broadcast reminder');

  // running again does not duplicate
  checkMatchdayReminders();
  const again = db.prepare(
    "SELECT COUNT(*) AS n FROM notifications WHERE type = 'reminder' AND title LIKE '%Speelronde 1%'"
  ).get().n;
  assert.equal(again, 1, 'deduplicated by settings flag');
});

test('3h last-call flag set only inside the window', () => {
  const soon = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
  db.prepare("UPDATE matches SET kickoff_utc = ? WHERE matchday = 1").run(soon);
  checkMatchdayReminders();
  const flag = db.prepare("SELECT value FROM settings WHERE key = 'reminder3_md1'").get();
  assert.ok(flag, 'last-call flag stored');
  // matchday 2 (far in the future) untouched
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM settings WHERE key = 'reminder3_md2'").get().n, 0);
});

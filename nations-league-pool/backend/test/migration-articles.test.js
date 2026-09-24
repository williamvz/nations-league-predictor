// One-time cleanup (1.8.1): recaps stored by older versions may belong to
// another match; they are dropped and the match is queued for a refetch.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nlpool-migr-art-'));
const file = path.join(tmp, 'test.db');
process.env.DB_PATH = file;
process.env.JWT_SECRET = 'x';

test('stored espn articles are stripped once and refetched', async () => {
  // simulate a 1.8.0 database: schema + one complete match with a wrong article
  {
    const db = (await import('../src/db/database.js')).default;
    const { seed } = await import('../src/db/seed.js');
    seed();
    db.prepare("DELETE FROM settings WHERE key = 'migr_recheck_articles_v1'").run();
    const id = db.prepare('SELECT id FROM matches LIMIT 1').get().id;
    db.prepare(`INSERT INTO match_details (match_id, provider, data, complete) VALUES (?, 'espn', ?, 1)`)
      .run(id, JSON.stringify({ stats: [{ key: 'saves', home: 1, away: 2 }], article: { headline: 'Portugal edge Wales' } }));
    db.prepare(`INSERT INTO match_details (match_id, provider, data, complete) VALUES (?, 'sim', ?, 1)`)
      .run(id + 1, JSON.stringify({ stats: [], article: { headline: 'Demo' } }));
  }
  // re-run the module-level migration on the same file in a fresh process
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, ['--input-type=module', '-e', "await import('./src/db/database.js')"], {
    env: { ...process.env, DB_PATH: file }, cwd: path.resolve(import.meta.dirname, '..'),
  });
  const raw = new Database(file);
  const espn = raw.prepare("SELECT data, complete FROM match_details WHERE provider = 'espn'").get();
  assert.equal(JSON.parse(espn.data).article, null, 'article stripped');
  assert.equal(JSON.parse(espn.data).stats.length, 1, 'rest kept');
  assert.equal(espn.complete, 0, 'queued for refetch');
  const sim = raw.prepare("SELECT data FROM match_details WHERE provider = 'sim'").get();
  assert.equal(JSON.parse(sim.data).article.headline, 'Demo', 'demo data untouched');
  // idempotent: marked done
  assert.ok(raw.prepare("SELECT 1 FROM settings WHERE key = 'migr_recheck_articles_v1'").get());
  raw.close();
});

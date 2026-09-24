// Detail sync scheduling: which matches get their ESPN summary (re)fetched,
// when a finished match is considered complete, and failure isolation.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { useTempDb } from './helpers.js';

useTempDb('nlpool-details-');
const db = (await import('../src/db/database.js')).default;
const { seed } = await import('../src/db/seed.js');
seed();
const { syncMatchDetails, matchesNeedingDetails, getDetails, storeDetails, RECAP_WAIT_HOURS } = await import('../src/sync/engine.js');
const { parseSummary } = await import('../src/sync/providers/espn.js');

const fixture = parseSummary(JSON.parse(fs.readFileSync(new URL('./fixtures/espn-summary.json', import.meta.url))));
const noArticle = { ...fixture, article: null };

const ids = db.prepare('SELECT id FROM matches ORDER BY id LIMIT 6').all().map((r) => r.id);
const [liveId, justFinished, oldFinished, soonId, farId, noEspnId] = ids;

function setMatch(id, status, kickoffOffset, espnId = `espn-${id}`) {
  db.prepare(`UPDATE matches SET status = ?, kickoff_utc = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?),
    provider_ids = ? WHERE id = ?`).run(status, kickoffOffset, JSON.stringify(espnId ? { espn: espnId } : {}), id);
}

test('selection: live, recently finished, about to start — not far-away or unmatched', () => {
  db.prepare("UPDATE matches SET kickoff_utc = '2030-01-01T00:00:00Z', status = 'scheduled', provider_ids = '{}'").run();
  setMatch(liveId, 'live', '-40 minutes');
  setMatch(justFinished, 'finished', '-3 hours');
  setMatch(oldFinished, 'finished', '-5 days');
  setMatch(soonId, 'scheduled', '+60 minutes');
  setMatch(farId, 'scheduled', '+3 days');
  setMatch(noEspnId, 'live', '-10 minutes', null);

  const picked = matchesNeedingDetails().map((m) => m.id).sort();
  assert.deepEqual(picked, [liveId, justFinished, soonId].sort());
  // the daily backfill also catches an old finished match that never got details
  const backfill = matchesNeedingDetails({ backfill: true }).map((m) => m.id);
  assert.ok(backfill.includes(oldFinished));
});

test('sync stores details; finished match without recap stays incomplete', async () => {
  const seen = [];
  const r = await syncMatchDetails({ fetcher: async (id) => { seen.push(id); return noArticle; } });
  assert.equal(r.fetched, 3);
  assert.ok(seen.includes(`espn-${liveId}`));
  const d = getDetails(justFinished);
  assert.equal(d.provider, 'espn');
  assert.equal(d.stats.length, fixture.stats.length);
  assert.equal(db.prepare('SELECT complete FROM match_details WHERE match_id = ?').get(justFinished).complete, 0);
  // so it is picked again on the next poll, waiting for the recap
  assert.ok(matchesNeedingDetails().some((m) => m.id === justFinished));
});

test('recap arrives → match complete, no more refetching', async () => {
  await syncMatchDetails({ fetcher: async () => fixture });
  assert.equal(db.prepare('SELECT complete FROM match_details WHERE match_id = ?').get(justFinished).complete, 1);
  assert.ok(!matchesNeedingDetails().some((m) => m.id === justFinished));
  assert.equal(getDetails(justFinished).article.headline, fixture.article.headline);
  // a live match is never complete, even with an article
  assert.equal(db.prepare('SELECT complete FROM match_details WHERE match_id = ?').get(liveId).complete, 0);
});

test(`no recap after ${RECAP_WAIT_HOURS}h → give up (complete)`, async () => {
  setMatch(oldFinished, 'finished', `-${RECAP_WAIT_HOURS + 1} hours`);
  await syncMatchDetails({ backfill: true, fetcher: async () => noArticle });
  assert.equal(db.prepare('SELECT complete FROM match_details WHERE match_id = ?').get(oldFinished).complete, 1);
});

test('one failing fetch does not stop the others and is logged', async () => {
  db.prepare('DELETE FROM match_details').run();
  const r = await syncMatchDetails({
    fetcher: async (id) => { if (id === `espn-${liveId}`) throw new Error('ESPN 503'); return noArticle; },
  });
  assert.equal(r.failed, 1);
  assert.ok(r.fetched >= 2);
  assert.equal(getDetails(liveId), null);
  const log = db.prepare("SELECT * FROM sync_log WHERE job = 'details' AND ok = 0 ORDER BY id DESC").get();
  assert.match(log.message, /ESPN 503/);
});

test('storeDetails upserts and getDetails survives corrupt rows', () => {
  storeDetails(farId, 'espn', { stats: [] });
  storeDetails(farId, 'espn', { stats: [{ key: 'saves', home: 1, away: 2 }] }, true);
  assert.equal(getDetails(farId).stats[0].away, 2);
  db.prepare("UPDATE match_details SET data = '{broken' WHERE match_id = ?").run(farId);
  assert.equal(getDetails(farId), null);
});

test('deleting a match cascades to its details', () => {
  storeDetails(farId, 'espn', { stats: [] });
  db.prepare('DELETE FROM predictions WHERE match_id = ?').run(farId);
  db.prepare('DELETE FROM matches WHERE id = ?').run(farId);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM match_details WHERE match_id = ?').get(farId).n, 0);
});

test('commentary lines keep the moment they were first seen', async () => {
  const id = ids[1];
  db.prepare('DELETE FROM match_details WHERE match_id = ?').run(id);
  const line = (seq, text) => ({ seq, minute: `${seq}'`, text, kind: null });
  storeDetails(id, 'espn', { commentary: [line(1, 'Kick-off.')] });
  const first = getDetails(id).commentary[0].seen;
  assert.ok(first > 0);
  await new Promise((r) => setTimeout(r, 15));
  storeDetails(id, 'espn', { commentary: [line(2, 'Corner.'), line(1, 'Kick-off.')] });
  const d = getDetails(id);
  assert.equal(d.commentary.find((c) => c.seq === 1).seen, first, 'old line keeps its stamp');
  assert.ok(d.commentary.find((c) => c.seq === 2).seen > first, 'new line is newer');
});

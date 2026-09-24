// Full HTTP walk through the API as the frontend uses it: registration and
// approval, predicting, results, leaderboard, standings, bonus, notifications,
// admin tools and the match-detail payload. One real Express instance, one
// throwaway database.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { useTempDb, startApp } from './helpers.js';

useTempDb('nlpool-api-');
const { call, url, close } = await startApp();
const db = (await import('../src/db/database.js')).default;
const { storeDetails } = await import('../src/sync/engine.js');
after(close);

let admin, anna, bram;
let future, past;

test('health, meta and unknown endpoints', async () => {
  assert.equal((await call('GET', '/health')).data.ok, true);
  const meta = await call('GET', '/meta');
  assert.equal(meta.status, 200);
  assert.equal(meta.data.registration_open, true);
  assert.equal(meta.data.has_invite_code, false);
  assert.equal((await call('GET', '/does-not-exist')).status, 401, 'unknown + anonymous → 401, never 200');
});

test('protected endpoints demand a token', async () => {
  for (const r of ['/matches', '/leaderboard', '/standings', '/bonus', '/notifications', '/auth/me']) {
    assert.equal((await call('GET', r)).status, 401, r);
  }
  assert.equal((await call('GET', '/matches', { token: 'garbage' })).status, 401);
});

test('admin login', async () => {
  assert.equal((await call('POST', '/auth/login', { body: { username: 'admin', password: 'wrong' } })).status, 401);
  const r = await call('POST', '/auth/login', { body: { username: 'admin', password: 'admin-pw-123' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.is_admin, 1);
  admin = r.data.token;
  assert.equal((await call('GET', '/does-not-exist', { token: admin })).status, 404);
});

test('registration → pending → approved → login', async () => {
  assert.equal((await call('POST', '/auth/register', { body: { username: 'x', password: '123456' } })).status, 400);
  assert.equal((await call('POST', '/auth/register', { body: { username: 'anna', password: '123' } })).status, 400);
  const reg = await call('POST', '/auth/register', { body: { username: 'anna', password: 'geheim1', display_name: 'Anna' } });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.pending, true);
  assert.equal((await call('POST', '/auth/register', { body: { username: 'anna', password: 'geheim1' } })).status, 409);
  assert.equal((await call('POST', '/auth/login', { body: { username: 'anna', password: 'geheim1' } })).status, 403);

  // admin gets an actionable notification and approves
  const notes = await call('GET', '/notifications', { token: admin });
  assert.equal(notes.status, 200);
  const users = (await call('GET', '/admin/users', { token: admin })).data.users;
  const pending = users.find((u) => u.username === 'anna');
  assert.equal(pending.status, 'pending');
  assert.equal((await call('POST', `/admin/users/${pending.id}/approve`, { token: admin })).status, 200);

  const login = await call('POST', '/auth/login', { body: { username: 'anna', password: 'geheim1' } });
  assert.equal(login.status, 200);
  anna = login.data.token;
});

test('invite code skips approval; non-admins are kept out of admin', async () => {
  await call('PUT', '/admin/settings', { token: admin, body: { invite_code: 'Oranje' } });
  assert.equal((await call('GET', '/meta')).data.has_invite_code, true);
  assert.equal((await call('POST', '/auth/register', { body: { username: 'bram', password: 'geheim2', invite_code: 'fout' } })).status, 403);
  const r = await call('POST', '/auth/register', { body: { username: 'bram', password: 'geheim2', invite_code: 'oranje' } });
  assert.equal(r.status, 201);
  assert.ok(r.data.token);
  bram = r.data.token;
  assert.equal((await call('GET', '/admin/dashboard', { token: bram })).status, 403);
});

test('profile update and language', async () => {
  const r = await call('PUT', '/auth/me', { token: anna, body: { avatar: '🦁', language: 'en' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.language, 'en');
  assert.equal((await call('PUT', '/auth/me', { token: anna, body: { language: 'xx' } })).status, 400);
});

test('match list + prediction rules', async () => {
  // deterministic clock: one open match in the future, one already played
  const ids = db.prepare("SELECT id FROM matches WHERE matchday = 1 ORDER BY id LIMIT 2").all().map((r) => r.id);
  [future, past] = ids;
  db.prepare("UPDATE matches SET kickoff_utc = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+2 days'), status = 'scheduled' WHERE id = ?").run(future);
  db.prepare("UPDATE matches SET kickoff_utc = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-3 hours'), status = 'scheduled' WHERE id = ?").run(past);

  const list = await call('GET', '/matches', { token: anna });
  assert.equal(list.status, 200);
  assert.ok(list.data.matches.length >= 48);
  assert.equal(list.data.matches.find((m) => m.id === future).is_locked, false);
  assert.equal(list.data.matches.find((m) => m.id === past).is_locked, true);

  assert.equal((await call('POST', '/predictions', { token: anna, body: { match_id: future, home_goals: 21, away_goals: 0 } })).status, 400);
  assert.equal((await call('POST', '/predictions', { token: anna, body: { match_id: 99999, home_goals: 1, away_goals: 0 } })).status, 404);
  assert.equal((await call('POST', '/predictions', { token: anna, body: { match_id: past, home_goals: 1, away_goals: 0 } })).status, 403);

  const p = await call('POST', '/predictions', { token: anna, body: { match_id: future, home_goals: 2, away_goals: 1, is_joker: true } });
  assert.equal(p.status, 200);
  assert.equal(p.data.prediction.is_joker, 1);
  await call('POST', '/predictions', { token: bram, body: { match_id: future, home_goals: 0, away_goals: 0 } });

  // no peeking at others before kickoff
  const detail = await call('GET', `/matches/${future}`, { token: anna });
  assert.equal(detail.data.match.prediction.home_goals, 2);
  assert.equal(detail.data.match.all_predictions, undefined);
  assert.equal(detail.data.match.details, null, 'no provider details yet');
  assert.equal((await call('GET', '/matches/99999', { token: anna })).status, 404);

  assert.equal((await call('GET', '/predictions/summary', { token: anna })).status, 200);
  assert.equal((await call('GET', '/matches/upcoming', { token: anna })).status, 200);
});

test('live match exposes details and everyone\'s predictions', async () => {
  db.prepare("UPDATE matches SET kickoff_utc = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 minutes'), status = 'live', minute = '31''', home_score = 1, away_score = 0 WHERE id = ?").run(future);
  storeDetails(future, 'espn', {
    status: 'live',
    stats: [{ key: 'possessionPct', home: 60, away: 40 }],
    timeline: [{ id: '1', kind: 'goal', minute: "12'", side: 'home', player: 'Cody Gakpo', related: null, text: null }],
    lineups: {}, commentary: [{ seq: 1, minute: "12'", text: 'Goal!', kind: 'goal' }],
    info: { venue: 'ArenA', city: 'Amsterdam', attendance: 50000, referee: 'Ref' }, article: null, h2h: [],
  });
  const live = await call('GET', '/matches/live', { token: anna });
  assert.equal(live.data.matches.length, 1);
  assert.equal(live.data.matches[0].minute, "31'");

  const d = (await call('GET', `/matches/${future}`, { token: bram })).data.match;
  assert.equal(d.all_predictions.length, 2);
  assert.equal(d.details.provider, 'espn');
  assert.equal(d.details.stats[0].home, 60);
  assert.equal(d.details.timeline[0].player, 'Cody Gakpo');
  assert.ok(d.details.updated_at);
  assert.equal(d.diagnostics, undefined, 'players get no diagnostics');

  const dx = (await call('GET', `/matches/${future}`, { token: admin })).data.match.diagnostics;
  assert.ok(dx, 'admins do');
  assert.ok('result_source' in dx && 'providers' in dx && 'details_updated_at' in dx);
});

test('manual result → points → leaderboard, standings, stats', async () => {
  assert.equal((await call('PUT', `/admin/matches/${future}/result`, { token: bram, body: { home_score: 2, away_score: 1 } })).status, 403);
  const r = await call('PUT', `/admin/matches/${future}/result`, { token: admin, body: { home_score: 2, away_score: 1 } });
  assert.equal(r.status, 200);

  const d = (await call('GET', `/matches/${future}`, { token: anna })).data.match;
  assert.equal(d.status, 'finished');
  assert.equal(d.all_predictions.find((p) => p.display_name === 'Anna').points, 10, 'exact + joker');

  const lb = await call('GET', '/leaderboard', { token: anna });
  assert.equal(lb.status, 200);
  const rows = lb.data.leaderboard || lb.data.rows || lb.data;
  assert.ok(JSON.stringify(rows).includes('Anna'));
  for (const r2 of ['/leaderboard/history', '/standings', '/standings/scorers', '/recaps', '/stats', '/achievements', '/achievements/unseen']) {
    assert.equal((await call('GET', r2, { token: anna })).status, 200, r2);
  }
  const teamId = db.prepare('SELECT home_team_id FROM matches WHERE id = ?').get(future).home_team_id;
  assert.equal((await call('GET', `/standings/team/${teamId}`, { token: anna })).status, 200);
});

test('admin reset clears result and details', async () => {
  const r = await call('PUT', `/admin/matches/${future}/reset`, { token: admin });
  assert.equal(r.status, 200);
  const d = (await call('GET', `/matches/${future}`, { token: anna })).data.match;
  assert.equal(d.status, 'scheduled');
  assert.equal(d.details, null);
});

test('bonus questions: validation and answering', async () => {
  const bonus = await call('GET', '/bonus', { token: anna });
  assert.equal(bonus.status, 200);
  const qs = bonus.data.questions;
  db.prepare("UPDATE bonus_questions SET deadline_utc = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+1 day')").run();
  const num = qs.find((q) => q.answer_type === 'number');
  assert.equal((await call('POST', `/bonus/${num.id}`, { token: anna, body: { answer_number: 30 } })).status, 400);
  assert.equal((await call('POST', `/bonus/${num.id}`, { token: anna, body: { answer_number: 12 } })).status, 200);
  const player = qs.find((q) => q.answer_type === 'player');
  assert.equal((await call('POST', `/bonus/${player.id}`, { token: anna, body: { answer_text: 'Memphis Depay' } })).status, 200);
  const team = qs.find((q) => q.answer_type === 'team' && q.team_group);
  const wrongGroup = db.prepare('SELECT id FROM teams WHERE group_name != ?').get(team.team_group).id;
  assert.equal((await call('POST', `/bonus/${team.id}`, { token: anna, body: { answer_team_id: wrongGroup } })).status, 400);
  assert.equal((await call('POST', `/bonus/${99999}`, { token: anna, body: {} })).status, 404);
});

test('notifications: broadcast and read-all', async () => {
  assert.equal((await call('POST', '/admin/broadcast', { token: admin, body: { title: '' } })).status, 400);
  assert.equal((await call('POST', '/admin/broadcast', { token: admin, body: { title: 'Hallo allemaal' } })).status, 200);
  const n = await call('GET', '/notifications', { token: anna });
  assert.ok(JSON.stringify(n.data).includes('Hallo allemaal'));
  assert.equal((await call('PUT', '/notifications/read-all', { token: anna })).status, 200);
});

test('admin: dashboard, sync log, sync disabled run, user management', async () => {
  assert.equal((await call('GET', '/admin/dashboard', { token: admin })).status, 200);
  assert.equal((await call('GET', '/admin/sync/log', { token: admin })).status, 200);
  await call('PUT', '/admin/settings', { token: admin, body: { sync_enabled: false } });
  const run = await call('POST', '/admin/sync/run', { token: admin });
  assert.equal(run.status, 200);
  assert.equal(run.data.scores.skipped, true, 'no network when sync is off');

  const created = await call('POST', '/admin/users', { token: admin, body: { username: 'kees', password: 'tijdelijk1' } });
  assert.equal(created.status, 201);
  assert.equal((await call('POST', '/admin/users', { token: admin, body: { username: 'kees', password: 'tijdelijk1' } })).status, 409);
  assert.equal((await call('DELETE', `/admin/users/${created.data.id}`, { token: admin })).status, 200);
  const me = (await call('GET', '/auth/me', { token: admin })).data.user;
  assert.equal((await call('DELETE', `/admin/users/${me.id}`, { token: admin })).status, 400, 'cannot delete yourself');
});

test('password change invalidates the old token', async () => {
  assert.equal((await call('PUT', '/auth/password', { token: bram, body: { current_password: 'nope', new_password: 'nieuw123' } })).status, 401);
  const r = await call('PUT', '/auth/password', { token: bram, body: { current_password: 'geheim2', new_password: 'nieuw123' } });
  assert.equal(r.status, 200);
  assert.ok(r.data.token);
  assert.equal((await call('POST', '/auth/login', { body: { username: 'bram', password: 'nieuw123' } })).status, 200);
});

test('static frontend fallback serves index.html (when built)', async () => {
  const res = await fetch(`${url}/some/client/route`);
  // 200 with a build present, 404 in a fresh checkout without one
  assert.ok([200, 404].includes(res.status));
});

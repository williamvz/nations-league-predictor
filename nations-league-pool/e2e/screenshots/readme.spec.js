import { test, expect } from '@playwright/test';
import path from 'node:path';

const OUT = path.resolve(import.meta.dirname, '../../../docs/screenshots');
const ADMIN = { username: 'william', password: 'shots-admin-pw' };
const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const TV = { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(request, token, method, route, data) {
  const r = await request.fetch(`/api${route}`, { method, data, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return r.json().catch(() => null);
}

/** Keep the demo simulator ticking until `until()` is true. */
async function play(request, token, until, maxMs) {
  const end = Date.now() + maxMs;
  while (Date.now() < end) {
    await api(request, token, 'POST', '/admin/sync/run');
    if (await until()) return true;
    await sleep(3000);
  }
  return false;
}

async function open(browser, opts, token) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript((tok) => {
    localStorage.setItem('nlpool_token', tok);
    localStorage.setItem('nlpool_lang', 'nl');
  }, token);
  const page = await ctx.newPage();
  // screenshots show the app, not the demo notice
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = '[data-demo-banner]{display:none!important}';
      document.head.appendChild(s);
    });
  });
  return { ctx, page };
}

async function shot(page, name, { fullPage = false, clip } = {}) {
  await sleep(700); // let counters and fonts settle
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage, clip });
}

test('README screenshots', async ({ browser, request }) => {
  const login = await api(request, null, 'POST', '/auth/login', ADMIN);
  const token = login.token;
  await api(request, token, 'PUT', '/auth/me', { display_name: 'William', avatar: '🦁', language: 'nl' });

  // predict every open match like a real (slightly optimistic) player
  const { matches } = await api(request, token, 'GET', '/matches');
  let i = 0;
  for (const m of matches.filter((x) => !x.is_locked)) {
    const h = [2, 1, 1, 0, 2, 3][i % 6];
    const a = [1, 1, 0, 0, 2, 1][i % 6];
    await api(request, token, 'POST', '/predictions', { match_id: m.id, home_goals: h, away_goals: a, is_joker: i % 8 === 0 });
    i += 1;
  }

  // play until a few matchdays are done AND a round is mid-match
  const ready = await play(request, token, async () => {
    const { matches: ms } = await api(request, token, 'GET', '/matches');
    const done = ms.filter((m) => m.status === 'finished').length;
    const live = ms.filter((m) => m.status === 'live' && /^([3-7]\d)'/.test(m.minute || ''));
    return done >= 32 && live.length >= 3;
  }, 10 * 60_000);
  expect(ready, 'season reached a good moment').toBeTruthy();
  await api(request, token, 'POST', '/achievements/seen');
  await api(request, token, 'PUT', '/notifications/read-all');

  const { matches: now } = await api(request, token, 'GET', '/matches');
  const live = now.filter((m) => m.status === 'live').sort((a, b) => parseInt(b.minute) - parseInt(a.minute))[0];

  // ---- mobile -----------------------------------------------------------------
  const { ctx, page } = await open(browser, MOBILE, token);
  await page.goto('/#/');
  await page.getByRole('heading', { name: /Hoi William/ }).waitFor();
  await shot(page, 'home');

  await page.goto('/#/wedstrijden');
  await page.getByRole('heading', { level: 1, name: 'Wedstrijden' }).waitFor();
  await page.locator('main .card').first().waitFor();
  await shot(page, 'matches');

  await page.goto(`/#/wedstrijden/${live.id}`);
  await page.getByTestId('match-detail').waitFor();
  await page.getByTestId('timeline').waitFor();
  await shot(page, 'match-overview');
  await page.getByTestId('tab-stats').click();
  await shot(page, 'match-stats');
  await page.getByTestId('tab-lineups').click();
  await shot(page, 'match-lineups');
  await page.getByTestId('tab-live').click();
  await shot(page, 'match-commentary');
  await page.getByTestId('tab-pool').click();
  await shot(page, 'match-predictions');

  await page.goto('/#/ranglijst');
  await page.getByRole('heading', { level: 1, name: 'Ranglijst' }).waitFor();
  await shot(page, 'leaderboard');

  await page.goto('/#/stand');
  await page.getByRole('heading', { level: 1, name: /Stand/ }).waitFor();
  await shot(page, 'standings');

  await page.goto('/#/sportkrant');
  await page.getByRole('heading', { level: 1, name: /Sportkrant/ }).waitFor();
  await shot(page, 'sportkrant');

  await page.goto('/#/kristallen-bol');
  await page.getByRole('heading', { level: 1, name: /Kristallen Bol/ }).waitFor();
  await shot(page, 'kristallen-bol');
  await ctx.close();

  // ---- TV mode ------------------------------------------------------------------
  await api(request, token, 'POST', '/admin/sync/run');
  const tv = await open(browser, TV, token);
  await tv.page.goto('/#/tv');
  await tv.page.getByTestId('tv-feed').waitFor();
  await shot(tv.page, 'tv');
  await tv.ctx.close();
});

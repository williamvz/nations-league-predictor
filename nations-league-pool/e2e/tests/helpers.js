import { expect } from '@playwright/test';
import { ADMIN } from '../playwright.config.js';

export { ADMIN };

/** Fail the test on any uncaught page error or console error. */
export function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return () => expect(errors, errors.join('\n')).toEqual([]);
}

export async function apiLogin(request, creds = ADMIN) {
  const r = await request.post('/api/auth/login', { data: creds });
  expect(r.ok()).toBeTruthy();
  return (await r.json()).token;
}

export async function api(request, token, method, route, data) {
  const r = await request.fetch(`/api${route}`, { method, data, headers: { Authorization: `Bearer ${token}` } });
  return { status: r.status(), data: await r.json().catch(() => null) };
}

/** Log in through the real login form. */
export async function uiLogin(page, creds = ADMIN) {
  await page.goto('/');
  await page.getByPlaceholder(/gebruikersnaam|username/i).fill(creds.username);
  await page.getByPlaceholder(/wachtwoord|password/i).fill(creds.password);
  await page.getByRole('button', { name: /^(inloggen|log in)$/i }).click();
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(page.getByPlaceholder(/wachtwoord|password/i)).toHaveCount(0);
  await dismissPopups(page);
}

/** Achievement / notification popups can cover the page after login. */
export async function dismissPopups(page) {
  for (let i = 0; i < 3; i++) {
    // never close the match-detail modal itself
    const close = page.locator('.fixed.inset-0:not(:has([data-testid="match-detail"])) button:has-text("✕")').first();
    if (!(await close.isVisible().catch(() => false))) break;
    await close.click({ timeout: 2000 }).catch(() => {});
  }
}

/**
 * Drive the demo simulator until a finished match with details exists.
 * Returns that match (from /api/matches/:id).
 */
export async function waitForFinishedMatchWithDetails(request, token, { needArticle = true } = {}) {
  const deadline = Date.now() + 170_000;
  while (Date.now() < deadline) {
    await api(request, token, 'POST', '/admin/sync/run');
    const { data } = await api(request, token, 'GET', '/matches');
    for (const m of data.matches.filter((x) => x.status === 'finished')) {
      const d = (await api(request, token, 'GET', `/matches/${m.id}`)).data.match;
      if (d.details && (!needArticle || d.details.article)) return d;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('no finished match with details appeared in time');
}

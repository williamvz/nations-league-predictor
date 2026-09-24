// Smoke test: every screen renders without crashing or logging errors.
import { test, expect } from '@playwright/test';
import { uiLogin, dismissPopups, watchErrors } from './helpers.js';

const PAGES = [
  ['/', /Hoi admin/],
  ['/wedstrijden', 'Wedstrijden'],
  ['/ranglijst', 'Ranglijst'],
  ['/stand', 'Stand · League A'],
  ['/meer', 'Meer'],
  ['/bonus', /Bonusvragen/],
  ['/sportkrant', /De Sportkrant/],
  ['/kristallen-bol', /Kristallen Bol/],
  ['/prestaties', 'Prestaties'],
  ['/blitz', null],
  ['/profiel', 'admin'],
  ['/admin', /Beheer/],
];

test('every page renders', async ({ page }) => {
  const check = watchErrors(page);
  await uiLogin(page);
  for (const [route, heading] of PAGES) {
    await page.goto(`/#${route}`);
    await dismissPopups(page);
    if (heading) await expect(page.getByRole('heading', { level: 1, name: heading }).first(), route).toBeVisible();
    else await expect(page.locator('main, #root').first()).toBeVisible();
  }
  check();
});

test('TV mode renders fullscreen dashboard', async ({ page }) => {
  const check = watchErrors(page);
  await uiLogin(page);
  await page.goto('/#/tv');
  await expect(page.locator('body')).toContainText(/Nations League|Stand|live|📅/i);
  check();
});

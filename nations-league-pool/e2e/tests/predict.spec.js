import { test, expect } from '@playwright/test';
import { uiLogin, apiLogin, api, watchErrors } from './helpers.js';

test('fill in a prediction through the match card', async ({ page, request }) => {
  const check = watchErrors(page);
  await uiLogin(page);
  await page.goto('/#/wedstrijden');
  // the "Alle" list keeps the card in place after saving (the "Nog invullen"
  // filter would drop it)
  // pin the card by position: its text changes once the editor opens
  await page.getByText('Vul je voorspelling in').last().waitFor();
  const n = await page.locator('main .card').count();
  let idx = -1;
  for (let i = n - 1; i >= 0; i--) {
    if ((await page.locator('main .card').nth(i).textContent()).includes('Vul je voorspelling in')) { idx = i; break; }
  }
  const card = page.locator('main .card').nth(idx);
  await card.getByText('Vul je voorspelling in').click();
  // steppers: bump home goals twice
  const plus = card.getByRole('button', { name: '+' });
  await plus.first().click();
  await plus.first().click();
  // read back what the steppers show (they start from a default, not 0–0)
  const [h, a] = await card.locator('span.w-8.tabular-nums').allTextContents();
  await card.getByRole('button', { name: 'Opslaan' }).click();
  await expect(card.getByText('Jouw voorspelling:')).toBeVisible();
  await expect(card).toContainText(`${h}–${a}`);

  // and it really landed in the backend
  const token = await apiLogin(request);
  const { data } = await api(request, token, 'GET', '/predictions');
  expect(JSON.stringify(data)).toContain(`"home_goals":${h},"away_goals":${a}`);
  check();
});

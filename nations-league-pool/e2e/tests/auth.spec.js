import { test, expect } from '@playwright/test';
import { uiLogin, apiLogin, api, watchErrors } from './helpers.js';

test('wrong password shows an error, right one logs in', async ({ page }) => {
  const check = watchErrors(page);
  await page.goto('/');
  await page.getByPlaceholder('Gebruikersnaam').fill('admin');
  await page.getByPlaceholder('Wachtwoord').fill('fout-wachtwoord');
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await expect(page.getByText('Onjuiste gebruikersnaam of wachtwoord')).toBeVisible();
  await uiLogin(page);
  await expect(page.getByRole('heading', { name: /Hoi admin/ })).toBeVisible();
  check();
});

test('registration → admin approves → new player logs in', async ({ page, request }, info) => {
  const username = `speler_${info.project.name}`;
  await page.goto('/');
  await page.getByText('Nog geen account? Meld je aan').click();
  await page.getByPlaceholder('Gebruikersnaam').fill(username);
  await page.getByPlaceholder('Wachtwoord').fill('geheim123');
  await page.getByPlaceholder(/Weergavenaam/).fill(`Speler ${info.project.name}`);
  await page.getByRole('button', { name: 'Aanmelden' }).click();
  await expect(page.getByText(/Aanmelding ontvangen/)).toBeVisible();

  const admin = await apiLogin(request);
  const users = (await api(request, admin, 'GET', '/admin/users')).data.users;
  const pending = users.find((u) => u.username === username);
  expect(pending.status).toBe('pending');
  expect((await api(request, admin, 'POST', `/admin/users/${pending.id}/approve`)).status).toBe(200);

  await uiLogin(page, { username, password: 'geheim123' });
  await expect(page.getByRole('heading', { name: new RegExp(`Hoi Speler ${info.project.name}`) })).toBeVisible();
});

test('public endpoints answer without a token', async ({ request }) => {
  expect((await request.get('/api/health')).status()).toBe(200);
  const meta = await (await request.get('/api/meta')).json();
  expect(meta.demo_mode).toBe(true);
});

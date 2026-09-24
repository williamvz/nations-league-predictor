// The new match screen: timeline, stats, line-ups, live commentary, recap
// and the pool tab — fed by the demo simulator exactly like ESPN would.
import { test, expect } from '@playwright/test';
import { uiLogin, apiLogin, api, watchErrors, waitForFinishedMatchWithDetails } from './helpers.js';

test('finished match: every tab shows its content', async ({ page, request }) => {
  const check = watchErrors(page);
  const token = await apiLogin(request);
  const m = await waitForFinishedMatchWithDetails(request, token);

  await uiLogin(page);
  await page.goto(`/#/wedstrijden/${m.id}`);
  const modal = page.getByTestId('match-detail');
  await expect(modal).toBeVisible();
  await expect(page.getByTestId('detail-score')).toContainText(`${m.home_score}–${m.away_score}`);

  // overview: timeline, mini stats, recap teaser, venue
  await expect(page.getByTestId('timeline')).toBeVisible();
  await expect(page.getByTestId('mini-stats')).toContainText('Balbezit');
  await expect(page.getByTestId('match-info')).toContainText('Scheidsrechter');
  const goalsInTimeline = m.details.timeline.filter((e) => e.kind === 'goal' || e.kind === 'penalty_goal').length;
  expect(goalsInTimeline).toBe(m.home_score + m.away_score);

  await page.getByTestId('tab-stats').click();
  await expect(page.getByTestId('stat-possessionPct')).toContainText('%');
  await expect(page.getByTestId('stats')).toContainText('Schoten');

  await page.getByTestId('tab-lineups').click();
  await expect(page.getByTestId('lineups')).toContainText(m.details.lineups.home.starters[0].name);
  await expect(page.getByTestId('lineups')).toContainText('Bank');

  await page.getByTestId('tab-live').click();
  await expect(page.getByTestId('commentary')).toContainText('Einde wedstrijd');
  // every simulated match has three subs per side → WISSEL badges; kick-off/end are headlines
  await expect(page.getByTestId('badge-substitution').first()).toContainText('Wissel');
  await expect(page.getByTestId('commentary-headline').first()).toBeVisible();

  await page.getByTestId('tab-report').click();
  await expect(page.getByTestId('report')).toContainText(m.details.article.headline);

  await page.getByTestId('tab-pool').click();
  await expect(page.getByTestId('all-predictions')).toBeVisible();

  // clicking a mini-stat jumps to the stats tab
  await page.getByTestId('tab-overview').click();
  await page.getByTestId('mini-stats').click();
  await expect(page.getByTestId('tab-stats')).toHaveAttribute('aria-selected', 'true');
  check();
});

test('scheduled match: no detail tabs yet, hint instead', async ({ page, request }) => {
  const token = await apiLogin(request);
  const { data } = await api(request, token, 'GET', '/matches');
  const future = data.matches.filter((x) => x.status === 'scheduled').pop();
  await uiLogin(page);
  await page.goto(`/#/wedstrijden/${future.id}`);
  await expect(page.getByTestId('match-detail')).toBeVisible();
  await expect(page.getByText(/Opstellingen, statistieken en het live-verslag verschijnen/)).toBeVisible();
  await expect(page.getByTestId('tab-stats')).toHaveCount(0);
});

test('match screen follows the chosen language', async ({ page, request }, info) => {
  const admin = await apiLogin(request);
  const username = `eng_${info.project.name}`;
  await api(request, admin, 'POST', '/admin/users', { username, password: 'english1', display_name: 'Eng' });
  const eng = await apiLogin(request, { username, password: 'english1' });
  await api(request, eng, 'PUT', '/auth/me', { language: 'en' });
  const m = await waitForFinishedMatchWithDetails(request, admin, { needArticle: false });

  await uiLogin(page, { username, password: 'english1' });
  await page.goto(`/#/wedstrijden/${m.id}`);
  await expect(page.getByTestId('tab-stats')).toHaveText('Stats');
  await page.getByTestId('tab-stats').click();
  await expect(page.getByTestId('stats')).toContainText('Possession');
});

test('TV mode: combined live feed with the acting team\'s flag', async ({ page, request }) => {
  const token = await apiLogin(request);
  const m = await waitForFinishedMatchWithDetails(request, token);
  await uiLogin(page);
  await page.goto('/#/tv');
  const feed = page.getByTestId('tv-feed');
  await expect(feed).toBeVisible();
  await expect(feed).toContainText('Live-verslag');
  const lines = page.getByTestId('tv-feed-line');
  expect(await lines.count()).toBeGreaterThan(3);
  // at least one line starts with a team flag (the feed holds the most
  // recent lines, which may come from any of the matches playing)
  const { data } = await api(request, token, 'GET', '/matches');
  const flags = [...new Set(data.matches.flatMap((x) => [x.home_flag, x.away_flag]))];
  expect(m.details.commentary.length).toBeGreaterThan(0);
  const texts = await lines.allTextContents();
  expect(texts.some((tx) => flags.some((f) => tx.startsWith(f)))).toBeTruthy();
});

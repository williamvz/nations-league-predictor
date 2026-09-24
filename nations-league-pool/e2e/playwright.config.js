// Browser tests against the real app: the frontend is built, the backend
// boots in demo mode on a throwaway database (fast simulated season, so live
// matches, finished matches and match details all appear within seconds).
import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.E2E_PORT || 8199);
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nlpool-e2e-'));
export const ADMIN = { username: 'admin', password: 'e2e-admin-pw' };

// Use a locally installed Chromium when the bundled one isn't downloaded
// (e.g. PLAYWRIGHT_CHROMIUM=/usr/bin/chromium npm test)
const launchOptions = process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {};

export default defineConfig({
  testDir: './tests',
  timeout: 180_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // one shared demo season; tests build on each other's state
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm --prefix ../frontend run build && node ../backend/src/server.js',
    url: `http://127.0.0.1:${PORT}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    env: {
      PORT: String(PORT),
      DB_PATH: path.join(dbDir, 'e2e.db'),
      JWT_SECRET: 'e2e-secret',
      ADMIN_USERNAME: ADMIN.username,
      ADMIN_PASSWORD: ADMIN.password,
      DEMO_MODE: '1',
      DEMO_MATCHDAY_MINUTES: '2',    // matchday 1 kicks off 2 min after boot; later ones stay open all run
      SIM_MATCH_MINUTES: '0.1',      // a simulated match lasts 6 seconds
    },
  },
});

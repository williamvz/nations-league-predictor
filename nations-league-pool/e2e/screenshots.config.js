// Regenerates the README screenshots: `npm run screenshots` (in e2e/).
// Boots the app in demo mode with a fast-forwarded season, lets a few
// matchdays play out and photographs the main screens into docs/screenshots/.
import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.SHOTS_PORT || 8198);
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nlpool-shots-'));
const launchOptions = process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {};

export default defineConfig({
  testDir: './screenshots',
  timeout: 15 * 60_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}`, launchOptions, colorScheme: 'dark', locale: 'nl-NL', timezoneId: 'Europe/Amsterdam' },
  webServer: {
    command: 'npm --prefix ../frontend run build && node ../backend/src/server.js',
    url: `http://127.0.0.1:${PORT}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      DB_PATH: path.join(dbDir, 'shots.db'),
      JWT_SECRET: 'shots-secret',
      ADMIN_USERNAME: 'william',
      ADMIN_PASSWORD: 'shots-admin-pw',
      DEMO_MODE: '1',
      DEMO_MATCHDAY_MINUTES: '0.75', // a new matchday every 45 s…
      SIM_MATCH_MINUTES: '1',        // …of 60-second matches, so rounds overlap and something is always live
    },
  },
});

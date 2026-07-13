import cron from 'node-cron';
import { syncScores, syncFixtures, inLiveWindow, syncEnabled } from './engine.js';
import { checkMatchdayReminders } from '../services/reminders.js';

// The whole point of this app: nobody has to enter anything by hand.
//  - every 2 min *only* while a match is live or about to start: live scores
//  - every 20 min on matchdays: catch-up sweep (covers missed finals)
//  - daily 05:30: fixture calendar sync + full catch-up
//  - at boot: catch-up (the Pi may have been off during matches)
export function startScheduler() {
  if (process.env.DEMO_MODE === '1') {
    // demo season: tick the simulator every 20 seconds for a lively ticker
    cron.schedule('*/20 * * * * *', async () => {
      await guard('demo-tick', syncScores);
    });
    console.log('🧪 Demo-scheduler actief (simulatie elke 20s)');
    return;
  }

  cron.schedule('*/2 * * * *', async () => {
    if (!syncEnabled() || !inLiveWindow()) return;
    await guard('live-poll', syncScores);
  });

  cron.schedule('*/20 * * * *', async () => {
    if (!syncEnabled()) return;
    await guard('sweep', syncScores);
  });

  cron.schedule('30 5 * * *', async () => {
    if (!syncEnabled()) return;
    await guard('daily', syncFixtures);
  }, { timezone: 'Europe/Amsterdam' });

  // matchday reminders (24h + 3h before first kickoff); cheap DB check
  cron.schedule('*/15 * * * *', () => {
    try {
      checkMatchdayReminders();
    } catch (err) {
      console.error('⚠️ [scheduler:reminders]', err.message);
    }
  });

  setTimeout(() => {
    guard('boot', async () => {
      await syncFixtures();
      await syncScores();
    });
  }, 10_000);

  console.log('⏰ Scheduler actief (live: 2 min, sweep: 20 min, fixtures: 05:30, reminders: 15 min)');
}

let running = false;
async function guard(label, job) {
  if (running) return;
  running = true;
  try {
    await job();
  } catch (err) {
    console.error(`⚠️ [scheduler:${label}]`, err.message);
  } finally {
    running = false;
  }
}

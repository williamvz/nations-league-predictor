import 'dotenv/config';

if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET ontbreekt. Zet deze in de add-on configuratie of .env.');
  process.exit(1);
}

const { seed } = await import('./db/seed.js');
seed();

const { createApp } = await import('./app.js');
const { startScheduler } = await import('./sync/scheduler.js');
const { initPush } = await import('./services/push.js');
initPush();

const app = createApp();
const PORT = process.env.PORT || 8099;
app.listen(PORT, () => {
  console.log(`🏆 Nations League Pool draait op poort ${PORT}`);
  if (process.env.NO_SCHEDULER !== '1') startScheduler();
});

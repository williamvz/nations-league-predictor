// Matchday reminders — fired by the scheduler, deduplicated via settings
// flags so each reminder goes out exactly once:
//  - ~24h before a matchday's first kickoff: broadcast + HA push to the admin
//  - ~3h before: targeted web push to players who still have open predictions
import db, { getSetting, setSetting } from '../db/database.js';
import { broadcast } from './notify.js';
import { notifyHomeAssistant } from './ha.js';
import { sendPush } from './push.js';
import { fmtAmsterdam } from '../utils/time.js';

function nextMatchdays() {
  return db.prepare(`
    SELECT matchday, MIN(kickoff_utc) AS first_kickoff, COUNT(*) AS match_count
    FROM matches
    WHERE status = 'scheduled' AND datetime(kickoff_utc) > datetime('now')
    GROUP BY matchday
    ORDER BY first_kickoff ASC
    LIMIT 3
  `).all();
}

function usersWithOpenPredictions(matchday) {
  return db.prepare(`
    SELECT u.id, u.display_name, COUNT(m.id) AS open
    FROM users u
    JOIN matches m ON m.matchday = ? AND m.status = 'scheduled' AND datetime(m.kickoff_utc) > datetime('now')
    LEFT JOIN predictions p ON p.match_id = m.id AND p.user_id = u.id
    WHERE u.status = 'active' AND p.id IS NULL
    GROUP BY u.id
  `).all(matchday);
}

export function checkMatchdayReminders() {
  for (const md of nextMatchdays()) {
    const hoursAway = (new Date(md.first_kickoff).getTime() - Date.now()) / 3600000;

    if (hoursAway <= 26 && hoursAway > 3 && !getSetting(`reminder24_md${md.matchday}`)) {
      setSetting(`reminder24_md${md.matchday}`, new Date().toISOString());
      const missing = usersWithOpenPredictions(md.matchday);
      const kickoffTxt = fmtAmsterdam(md.first_kickoff);
      broadcast('reminder', `⏰ Speelronde ${md.matchday} begint morgen!`,
        `Eerste aftrap: ${kickoffTxt}. Vul je voorspellingen op tijd in!`);
      sendPush(null, {
        title: `⏰ Speelronde ${md.matchday} begint morgen!`,
        body: `Eerste aftrap: ${kickoffTxt}. Zet je voorspellingen vast!`,
      }).catch(() => {});
      notifyHomeAssistant('⚽ Nations League Pool',
        `Speelronde ${md.matchday} begint morgen (${kickoffTxt}). ${missing.length} speler(s) hebben nog niet alles ingevuld.`)
        .catch(() => {});
    }

    if (hoursAway <= 3 && hoursAway > 0 && !getSetting(`reminder3_md${md.matchday}`)) {
      setSetting(`reminder3_md${md.matchday}`, new Date().toISOString());
      const missing = usersWithOpenPredictions(md.matchday);
      // last call: only nag the people who actually still have gaps
      sendPush(missing.map((u) => u.id), {
        title: '🚨 Laatste kans!',
        body: `Speelronde ${md.matchday} begint zo en je hebt nog voorspellingen open. Snel invullen!`,
        url: './#/wedstrijden',
      }).catch(() => {});
      if (missing.length > 0) {
        notifyHomeAssistant('⚽ Nations League Pool',
          `Nog ${missing.length} speler(s) zonder complete voorspellingen voor speelronde ${md.matchday}: ${missing.map((u) => u.display_name).join(', ')}.`)
          .catch(() => {});
      }
    }
  }
}

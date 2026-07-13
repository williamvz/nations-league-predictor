// Idempotent seed: safe to run at every startup. Inserts teams, fixtures and
// bonus questions only when missing; never overwrites results or predictions.
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import db from './database.js';
import { TEAMS, MATCHES, SEASON } from './tournamentData.js';
import { amsterdamToUtc } from '../utils/time.js';

export function seed() {
  const teamCount = db.prepare('SELECT COUNT(*) AS n FROM teams').get().n;
  if (teamCount === 0) {
    const ins = db.prepare(
      'INSERT INTO teams (code, name_nl, name_en, group_name, flag, aliases) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const tx = db.transaction(() => {
      for (const t of TEAMS) {
        ins.run(t.code, t.nameNl, t.nameEn, t.group, t.flag, JSON.stringify(t.aliases || []));
      }
    });
    tx();
    console.log(`✅ ${TEAMS.length} landen toegevoegd`);
  }

  const teamByCode = {};
  for (const row of db.prepare('SELECT id, code, group_name FROM teams').all()) {
    teamByCode[row.code] = row;
  }

  const matchCount = db.prepare('SELECT COUNT(*) AS n FROM matches').get().n;
  if (matchCount === 0) {
    const ins = db.prepare(`
      INSERT INTO matches (matchday, group_name, stage, home_team_id, away_team_id, kickoff_utc, kickoff_confirmed)
      VALUES (?, ?, 'league', ?, ?, ?, ?)
    `);
    const tx = db.transaction(() => {
      for (const m of MATCHES) {
        const home = teamByCode[m.home];
        const away = teamByCode[m.away];
        ins.run(
          m.matchday, home.group_name, home.id, away.id,
          amsterdamToUtc(m.date, m.time), m.kickoffConfirmed ? 1 : 0
        );
      }
    });
    tx();
    console.log(`✅ ${MATCHES.length} wedstrijden toegevoegd (Nations League ${SEASON})`);
  }

  seedBonusQuestions();
  seedAdmin();
  if (process.env.DEMO_MODE === '1') seedDemo();
}

/**
 * Demo mode: compress the season so it plays out in ~1 hour and add bot
 * players with predictions, so the leaderboard, notifications and bonus
 * payouts can all be watched live before the real season starts.
 */
function seedDemo() {
  if (getDemoFlag()) return;
  const rows = db.prepare("SELECT id, matchday FROM matches WHERE stage = 'league' ORDER BY matchday, kickoff_utc, id").all();
  const upd = db.prepare('UPDATE matches SET kickoff_utc = ?, kickoff_confirmed = 1 WHERE id = ?');
  const perDay = new Map();
  const tx = db.transaction(() => {
    for (const m of rows) {
      const idx = perDay.get(m.matchday) || 0;
      perDay.set(m.matchday, idx + 1);
      // matchday k starts k×DEMO_MATCHDAY_MINUTES from boot, matches staggered
      const spacing = Number(process.env.DEMO_MATCHDAY_MINUTES || 6) * 60;
      const t = new Date(Date.now() + (m.matchday * spacing + idx * spacing / 12) * 1000);
      upd.run(t.toISOString(), m.id);
    }
    // bonus deadlines follow the compressed schedule
    const firstKickoff = db.prepare("SELECT MIN(kickoff_utc) AS k FROM matches WHERE stage = 'league'").get().k;
    const md3 = db.prepare('SELECT MIN(kickoff_utc) AS k FROM matches WHERE matchday = 3').get().k;
    db.prepare("UPDATE bonus_questions SET deadline_utc = ? WHERE question_key != 'top_scorer'").run(firstKickoff);
    db.prepare("UPDATE bonus_questions SET deadline_utc = ? WHERE question_key = 'top_scorer'").run(md3);
  });
  tx();

  const bots = [
    ['robo_pepijn', 'Robo-Pepijn 🤖', '🤖'],
    ['bot_oma', 'Bot-Oma 👵', '🍀'],
    ['kwakbot', 'KwakBot 3000', '🦆'],
  ];
  const bcryptHash = bcrypt.hashSync(crypto.randomBytes(12).toString('base64url'), 10);
  const teams = db.prepare('SELECT id, group_name FROM teams').all();
  const questions = db.prepare('SELECT * FROM bonus_questions').all();
  for (const [username, displayName, avatar] of bots) {
    const info = db.prepare(
      'INSERT INTO users (username, display_name, password_hash, avatar) VALUES (?, ?, ?, ?)'
    ).run(username, displayName, bcryptHash, avatar);
    const botId = info.lastInsertRowid;
    const rnd = () => Math.floor(Math.random() * 4);
    const insPred = db.prepare('INSERT INTO predictions (user_id, match_id, home_goals, away_goals, is_joker) VALUES (?, ?, ?, ?, ?)');
    const matches = db.prepare("SELECT id, matchday FROM matches WHERE stage = 'league'").all();
    const jokerPerDay = new Set();
    for (const m of matches) {
      const joker = !jokerPerDay.has(m.matchday) && Math.random() < 0.2 ? 1 : 0;
      if (joker) jokerPerDay.add(m.matchday);
      insPred.run(botId, m.id, rnd(), rnd(), joker);
    }
    for (const q of questions) {
      if (q.answer_type === 'team') {
        const pool = q.team_group ? teams.filter((t) => t.group_name === q.team_group) : teams;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        db.prepare('INSERT INTO bonus_answers (user_id, question_id, answer_team_id) VALUES (?, ?, ?)').run(botId, q.id, pick.id);
      } else if (q.answer_type === 'number') {
        db.prepare('INSERT INTO bonus_answers (user_id, question_id, answer_number) VALUES (?, ?, ?)').run(botId, q.id, 6 + Math.floor(Math.random() * 8));
      } else {
        db.prepare('INSERT INTO bonus_answers (user_id, question_id, answer_text) VALUES (?, ?, ?)').run(botId, q.id, 'Memphis Depay');
      }
    }
  }
  db.prepare("INSERT INTO settings (key, value) VALUES ('demo_seeded', '1')").run();
  console.log('🧪 DEMO-MODUS: seizoen gecomprimeerd (~1 uur), 3 bots doen mee');
}

function getDemoFlag() {
  return db.prepare("SELECT value FROM settings WHERE key = 'demo_seeded'").get();
}

function seedBonusQuestions() {
  const firstKickoff = db.prepare("SELECT MIN(kickoff_utc) AS k FROM matches WHERE stage = 'league'").get().k;
  const md3Kickoff = db.prepare("SELECT MIN(kickoff_utc) AS k FROM matches WHERE matchday = 3").get().k;

  // INSERT OR IGNORE per key: existing databases pick up new questions on update
  const ins = db.prepare(`
    INSERT OR IGNORE INTO bonus_questions (question_key, question_nl, answer_type, team_group, deadline_utc, points, points_close)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  let added = 0;
  for (const g of ['A1', 'A2', 'A3', 'A4']) {
    added += ins.run(`winner_${g}`, `Wie wint groep ${g}?`, 'team', g, firstKickoff, 5, 0).changes;
  }
  added += ins.run('top_scorer', 'Wie wordt topscorer van de League A-groepsfase?', 'player', null, md3Kickoff, 5, 0).changes;
  added += ins.run('points_ned', 'Hoeveel punten haalt Nederland in de groepsfase? (0–18)', 'number', null, firstKickoff, 5, 2).changes;
  added += ins.run('champion', 'Wie wint de Nations League? (finale juni 2027)', 'team', null, firstKickoff, 10, 0).changes;
  if (added > 0) console.log(`✅ ${added} bonusvra(a)g(en) toegevoegd`);
}

function seedAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1').get().n;
  if (count > 0) return;

  const username = process.env.ADMIN_USERNAME || 'william';
  let password = process.env.ADMIN_PASSWORD;
  let generated = false;
  if (!password) {
    password = crypto.randomBytes(9).toString('base64url');
    generated = true;
  }
  db.prepare(`
    INSERT INTO users (username, display_name, password_hash, is_admin, avatar, must_change_password)
    VALUES (?, ?, ?, 1, '👑', ?)
  `).run(username, username, bcrypt.hashSync(password, 10), generated ? 1 : 0);

  console.log(`✅ Beheerder '${username}' aangemaakt`);
  if (generated) {
    console.log('┌──────────────────────────────────────────────────┐');
    console.log(`│  Eenmalig gegenereerd beheerderswachtwoord:      │`);
    console.log(`│  ${password.padEnd(48)}│`);
    console.log('│  Wijzig dit direct na de eerste login!           │');
    console.log('└──────────────────────────────────────────────────┘');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed();
}

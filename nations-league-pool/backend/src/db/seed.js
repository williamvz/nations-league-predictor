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
}

function seedBonusQuestions() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM bonus_questions').get().n;
  if (count > 0) return;

  const firstKickoff = db.prepare("SELECT MIN(kickoff_utc) AS k FROM matches WHERE stage = 'league'").get().k;
  const md3Kickoff = db.prepare("SELECT MIN(kickoff_utc) AS k FROM matches WHERE matchday = 3").get().k;

  const ins = db.prepare(`
    INSERT INTO bonus_questions (question_key, question_nl, answer_type, team_group, deadline_utc, points, points_close)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const g of ['A1', 'A2', 'A3', 'A4']) {
    ins.run(`winner_${g}`, `Wie wint groep ${g}?`, 'team', g, firstKickoff, 5, 0);
  }
  ins.run('top_scorer', 'Wie wordt topscorer van de League A-groepsfase?', 'player', null, md3Kickoff, 5, 0);
  ins.run('points_ned', 'Hoeveel punten haalt Nederland in de groepsfase? (0–18)', 'number', null, firstKickoff, 5, 2);
  console.log('✅ Bonusvragen toegevoegd');
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

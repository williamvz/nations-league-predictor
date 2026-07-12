import db from '../db/database.js';
import { notifyUser } from './notify.js';

export const ACHIEVEMENTS = [
  { key: 'first_shot',    name: 'Eerste Schot',       icon: '🎯', rarity: 'common',    description: 'Je eerste voorspelling ingevuld' },
  { key: 'full_matchday', name: 'Speelronde Compleet', icon: '📋', rarity: 'common',    description: 'Alle wedstrijden van een speelronde voorspeld' },
  { key: 'completionist', name: 'Alles Ingevuld',     icon: '💯', rarity: 'uncommon',  description: 'Alle 48 groepswedstrijden voorspeld' },
  { key: 'sharpshooter',  name: 'Scherpschutter',     icon: '🎯', rarity: 'uncommon',  description: 'Een exacte uitslag voorspeld' },
  { key: 'hattrick',      name: 'Hattrick',           icon: '🎩', rarity: 'rare',      description: '3 exacte uitslagen' },
  { key: 'oracle',        name: 'Orakel',             icon: '🔮', rarity: 'legendary', description: '5 exacte uitslagen' },
  { key: 'on_fire_3',     name: 'Op Dreef',           icon: '🔥', rarity: 'uncommon',  description: '3 voorspellingen op rij met punten' },
  { key: 'on_fire_5',     name: 'Onstuitbaar',        icon: '⚡', rarity: 'rare',      description: '5 voorspellingen op rij met punten' },
  { key: 'on_fire_10',    name: 'Legende',            icon: '👑', rarity: 'legendary', description: '10 voorspellingen op rij met punten' },
  { key: 'joker_hit',     name: 'Joker!',             icon: '🃏', rarity: 'rare',      description: 'Exacte uitslag op je jokerwedstrijd' },
  { key: 'golden_round',  name: 'Gouden Speelronde',  icon: '🏅', rarity: 'rare',      description: '20+ punten in één speelronde' },
  { key: 'day_winner',    name: 'Dagwinnaar',         icon: '🌟', rarity: 'uncommon',  description: 'De meeste punten van iedereen in een speelronde' },
  { key: 'leader',        name: 'Koploper',           icon: '🥇', rarity: 'uncommon',  description: 'Eerste plaats na een speelronde' },
  { key: 'climber',       name: 'Klimmer',            icon: '🧗', rarity: 'uncommon',  description: '3+ plaatsen gestegen in één speelronde' },
  { key: 'comeback_kid',  name: 'Comeback Kid',       icon: '🚀', rarity: 'legendary', description: 'Van de onderste helft naar de top 3' },
];

function unlock(userId, key) {
  const res = db.prepare('INSERT OR IGNORE INTO achievements (user_id, achievement_key) VALUES (?, ?)').run(userId, key);
  if (res.changes > 0) {
    const def = ACHIEVEMENTS.find((a) => a.key === key);
    if (def) notifyUser(userId, 'achievement', `Prestatie ontgrendeld: ${def.icon} ${def.name}`, def.description);
    return true;
  }
  return false;
}

/** Per-user checks; runs after saving a prediction or scoring a match. Cheap. */
export function checkAchievements(userId) {
  const has = new Set(
    db.prepare('SELECT achievement_key FROM achievements WHERE user_id = ?').all(userId).map((r) => r.achievement_key)
  );
  const needAll = ACHIEVEMENTS.every((a) => has.has(a.key));
  if (needAll) return;

  const predCount = db.prepare('SELECT COUNT(*) AS n FROM predictions WHERE user_id = ?').get(userId).n;
  if (!has.has('first_shot') && predCount > 0) unlock(userId, 'first_shot');

  if (!has.has('full_matchday') || !has.has('completionist')) {
    const rows = db.prepare(`
      SELECT m.matchday, COUNT(m.id) AS total, COUNT(p.id) AS filled
      FROM matches m
      LEFT JOIN predictions p ON p.match_id = m.id AND p.user_id = ?
      WHERE m.stage = 'league'
      GROUP BY m.matchday
    `).all(userId);
    if (!has.has('full_matchday') && rows.some((r) => r.total > 0 && r.filled === r.total)) unlock(userId, 'full_matchday');
    if (!has.has('completionist') && rows.length > 0 && rows.every((r) => r.filled === r.total)) unlock(userId, 'completionist');
  }

  const scored = db.prepare(`
    SELECT p.points, p.is_joker, p.home_goals, p.away_goals, m.home_score, m.away_score, m.stage
    FROM predictions p JOIN matches m ON m.id = p.match_id
    WHERE p.user_id = ? AND p.points IS NOT NULL
    ORDER BY m.kickoff_utc ASC
  `).all(userId);

  const exact = scored.filter((s) => s.home_goals === s.home_score && s.away_goals === s.away_score);
  if (!has.has('sharpshooter') && exact.length >= 1) unlock(userId, 'sharpshooter');
  if (!has.has('hattrick') && exact.length >= 3) unlock(userId, 'hattrick');
  if (!has.has('oracle') && exact.length >= 5) unlock(userId, 'oracle');
  if (!has.has('joker_hit') && exact.some((s) => s.is_joker === 1)) unlock(userId, 'joker_hit');

  let streak = 0, maxStreak = 0;
  for (const s of scored) {
    streak = s.points > 0 ? streak + 1 : 0;
    maxStreak = Math.max(maxStreak, streak);
  }
  if (!has.has('on_fire_3') && maxStreak >= 3) unlock(userId, 'on_fire_3');
  if (!has.has('on_fire_5') && maxStreak >= 5) unlock(userId, 'on_fire_5');
  if (!has.has('on_fire_10') && maxStreak >= 10) unlock(userId, 'on_fire_10');
}

/** Rank-based checks; runs once when a matchday is finalized (snapshots exist). */
export function checkMatchdayAchievements(matchday) {
  const snaps = db.prepare('SELECT * FROM matchday_snapshots WHERE matchday = ?').all(matchday);
  if (snaps.length === 0) return;

  const bestPts = Math.max(...snaps.map((s) => s.matchday_points));
  for (const s of snaps) {
    if (s.matchday_points >= 20) unlock(s.user_id, 'golden_round');
    if (bestPts > 0 && s.matchday_points === bestPts) unlock(s.user_id, 'day_winner');
    if (s.rank === 1 && s.total_points > 0) unlock(s.user_id, 'leader');
  }

  const prev = db.prepare('SELECT * FROM matchday_snapshots WHERE matchday = ?').all(matchday - 1);
  const prevByUser = new Map(prev.map((s) => [s.user_id, s]));
  const half = Math.ceil(snaps.length / 2);
  for (const s of snaps) {
    const before = prevByUser.get(s.user_id);
    if (before && before.rank - s.rank >= 3) unlock(s.user_id, 'climber');
  }
  // comeback: bottom half in ANY earlier snapshot, top 3 now
  const earlier = db.prepare('SELECT user_id, MAX(rank) AS worst FROM matchday_snapshots WHERE matchday < ? GROUP BY user_id').all(matchday);
  const worstByUser = new Map(earlier.map((r) => [r.user_id, r.worst]));
  for (const s of snaps) {
    const worst = worstByUser.get(s.user_id);
    if (worst != null && worst > half && s.rank <= 3) unlock(s.user_id, 'comeback_kid');
  }
}

import db from '../db/database.js';
import { computeGroupStandings } from './standings.js';
import { broadcast } from './notify.js';
import { normalizeName } from '../sync/matcher.js';

/**
 * Auto-resolve bonus questions once their outcome is decided. Fully automatic:
 * group winners + the Netherlands-points question from final standings, the
 * top scorer from synced goal events. Idempotent; runs after every sync.
 */
export function resolveBonusQuestions() {
  resolveGroupWinners();
  resolveNedPoints();
  resolveTopScorer();
}

function groupComplete(group) {
  const open = db.prepare(`
    SELECT COUNT(*) AS n FROM matches
    WHERE group_name = ? AND stage = 'league' AND status != 'finished'
  `).get(group).n;
  return open === 0;
}

function allLeagueComplete() {
  return db.prepare("SELECT COUNT(*) AS n FROM matches WHERE stage = 'league' AND status != 'finished'").get().n === 0;
}

function award(question, isCorrect) {
  const answers = db.prepare('SELECT * FROM bonus_answers WHERE question_id = ?').all(question.id);
  const upd = db.prepare('UPDATE bonus_answers SET points = ? WHERE id = ?');
  const winners = [];
  const tx = db.transaction(() => {
    for (const a of answers) {
      const pts = isCorrect(a);
      upd.run(pts, a.id);
      if (pts >= question.points) winners.push(a.user_id);
    }
    db.prepare('UPDATE bonus_questions SET resolved = 1 WHERE id = ?').run(question.id);
  });
  tx();
  return winners;
}

function resolveGroupWinners() {
  const questions = db.prepare(`
    SELECT * FROM bonus_questions WHERE question_key LIKE 'winner_%' AND resolved = 0
  `).all();
  for (const q of questions) {
    const group = q.question_key.slice('winner_'.length);
    if (!groupComplete(group)) continue;
    const standings = computeGroupStandings(group);
    const winner = standings[0];
    if (!winner) continue;

    db.prepare('UPDATE bonus_questions SET correct_team_id = ? WHERE id = ?').run(winner.team_id, q.id);
    const winners = award(q, (a) => (a.answer_team_id === winner.team_id ? q.points : 0));
    broadcast(
      'bonus',
      `Groep ${group} is beslist: ${winner.flag} ${winner.name_nl} wint! 🏆`,
      winners.length
        ? `${winners.length} speler(s) hadden dit goed voorspeld (+${q.points} punten).`
        : 'Niemand had dit goed voorspeld.'
    );
  }
}

function resolveNedPoints() {
  const q = db.prepare("SELECT * FROM bonus_questions WHERE question_key = 'points_ned' AND resolved = 0").get();
  if (!q) return;
  const ned = db.prepare("SELECT id, group_name FROM teams WHERE code = 'NED'").get();
  if (!ned || !groupComplete(ned.group_name)) return;

  const standings = computeGroupStandings(ned.group_name);
  const row = standings.find((r) => r.team_id === ned.id);
  if (!row) return;

  db.prepare('UPDATE bonus_questions SET correct_number = ? WHERE id = ?').run(row.points, q.id);
  award(q, (a) => {
    if (a.answer_number == null) return 0;
    if (a.answer_number === row.points) return q.points;
    if (Math.abs(a.answer_number - row.points) === 1) return q.points_close;
    return 0;
  });
  broadcast('bonus', `Nederland sluit de groepsfase af met ${row.points} punten 🇳🇱`,
    'De bonusvraag is uitgekeerd. Bekijk de ranglijst!');
}

function resolveTopScorer() {
  const q = db.prepare("SELECT * FROM bonus_questions WHERE question_key = 'top_scorer' AND resolved = 0").get();
  if (!q || !allLeagueComplete()) return;

  const top = db.prepare(`
    SELECT player_name, goals FROM scorers ORDER BY goals DESC
  `).all();
  if (top.length === 0 || top[0].goals === 0) return;

  const maxGoals = top[0].goals;
  const names = top.filter((s) => s.goals === maxGoals).map((s) => s.player_name);
  const normalized = names.map(normalizeName);

  db.prepare('UPDATE bonus_questions SET correct_text = ? WHERE id = ?').run(JSON.stringify(names), q.id);
  const winners = award(q, (a) => {
    const answer = normalizeName(a.answer_text || '');
    if (!answer) return 0;
    // accept full-name match or unambiguous surname match
    const hit = normalized.some((n) => n === answer || n.endsWith(` ${answer}`) || answer.endsWith(` ${n}`));
    return hit ? q.points : 0;
  });
  broadcast('bonus', `Topscorer van de groepsfase: ${names.join(' & ')} (${maxGoals} goals) ⚽`,
    winners.length ? `${winners.length} speler(s) verdienen +${q.points} punten!` : 'Niemand had de topscorer goed.');
}

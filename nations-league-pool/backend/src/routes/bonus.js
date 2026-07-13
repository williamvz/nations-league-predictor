import { Router } from 'express';
import db from '../db/database.js';
import { authenticate } from '../middleware/auth.js';
import { checkAchievements } from '../services/achievements.js';

const router = Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const questions = db.prepare(`
    SELECT q.id, q.question_key, q.question_nl, q.answer_type, q.team_group, q.deadline_utc,
           q.points, q.points_close, q.resolved, q.correct_team_id, q.correct_text, q.correct_number,
           ct.name_nl AS correct_team_name, ct.flag AS correct_team_flag, ct.code AS correct_team_code,
           a.answer_team_id, a.answer_text, a.answer_number, a.points AS earned_points,
           at.name_nl AS answer_team_name, at.flag AS answer_team_flag, at.code AS answer_team_code
    FROM bonus_questions q
    LEFT JOIN bonus_answers a ON a.question_id = q.id AND a.user_id = ?
    LEFT JOIN teams at ON at.id = a.answer_team_id
    LEFT JOIN teams ct ON ct.id = q.correct_team_id
    ORDER BY q.id ASC
  `).all(req.user.id);

  for (const q of questions) {
    q.is_locked = new Date(q.deadline_utc).getTime() <= Date.now();
    if (q.answer_type === 'team') {
      q.choices = q.team_group
        ? db.prepare('SELECT id, code, name_nl, flag FROM teams WHERE group_name = ? ORDER BY name_nl').all(q.team_group)
        : db.prepare('SELECT id, code, name_nl, flag FROM teams ORDER BY name_nl').all();
    }
    if (q.correct_text) {
      try { q.correct_names = JSON.parse(q.correct_text); } catch { q.correct_names = [q.correct_text]; }
    }
    delete q.correct_text;
  }
  res.json({ questions });
});

router.post('/:questionId', (req, res) => {
  const q = db.prepare('SELECT * FROM bonus_questions WHERE id = ?').get(Number(req.params.questionId));
  if (!q) return res.status(404).json({ error: 'Vraag niet gevonden' });
  if (q.resolved || new Date(q.deadline_utc).getTime() <= Date.now()) {
    return res.status(403).json({ error: 'De deadline voor deze vraag is verstreken' });
  }

  let teamId = null, text = null, number = null;
  if (q.answer_type === 'team') {
    teamId = Number(req.body.answer_team_id);
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
    if (!team || (q.team_group && team.group_name !== q.team_group)) {
      return res.status(400).json({ error: 'Kies een land uit de juiste groep' });
    }
  } else if (q.answer_type === 'player') {
    text = String(req.body.answer_text || '').trim().slice(0, 60);
    if (text.length < 2) return res.status(400).json({ error: 'Vul een spelersnaam in' });
  } else if (q.answer_type === 'number') {
    number = Number(req.body.answer_number);
    if (!Number.isInteger(number) || number < 0 || number > 18) {
      return res.status(400).json({ error: 'Vul een aantal punten in (0-18)' });
    }
  }

  db.prepare(`
    INSERT INTO bonus_answers (user_id, question_id, answer_team_id, answer_text, answer_number)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, question_id) DO UPDATE SET
      answer_team_id = excluded.answer_team_id,
      answer_text = excluded.answer_text,
      answer_number = excluded.answer_number,
      updated_at = datetime('now')
  `).run(req.user.id, q.id, teamId, text, number);

  checkAchievements(req.user.id);
  res.json({ ok: true });
});

export default router;

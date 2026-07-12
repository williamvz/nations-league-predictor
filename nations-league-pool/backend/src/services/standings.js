import db from '../db/database.js';

/**
 * Group standings from finished matches (optionally counting live scores as
 * provisional). Tie-breakers follow the UEFA league-phase order: points →
 * head-to-head points → head-to-head goal difference → overall goal
 * difference → overall goals scored → name.
 */
export function computeGroupStandings(groupName, { includeLive = false } = {}) {
  const teams = db.prepare('SELECT id, code, name_nl, name_en, flag FROM teams WHERE group_name = ?').all(groupName);
  const statuses = includeLive ? ['finished', 'live'] : ['finished'];
  const matches = db.prepare(`
    SELECT * FROM matches
    WHERE group_name = ? AND stage = 'league'
      AND status IN (${statuses.map(() => '?').join(',')})
      AND home_score IS NOT NULL AND away_score IS NOT NULL
  `).all(groupName, ...statuses);

  const table = new Map(teams.map((t) => [t.id, {
    team_id: t.id, code: t.code, name_nl: t.name_nl, name_en: t.name_en, flag: t.flag,
    played: 0, won: 0, drawn: 0, lost: 0, goals_for: 0, goals_against: 0, goal_diff: 0, points: 0,
    form: [],
  }]));

  const sorted = [...matches].sort((a, b) => a.kickoff_utc.localeCompare(b.kickoff_utc));
  for (const m of sorted) {
    const home = table.get(m.home_team_id);
    const away = table.get(m.away_team_id);
    if (!home || !away) continue;
    applyResult(home, m.home_score, m.away_score, m.status === 'live');
    applyResult(away, m.away_score, m.home_score, m.status === 'live');
  }

  const rows = [...table.values()];
  rows.sort((a, b) =>
    b.points - a.points ||
    compareHeadToHead(a, b, matches) ||
    b.goal_diff - a.goal_diff ||
    b.goals_for - a.goals_for ||
    a.name_nl.localeCompare(b.name_nl)
  );
  return rows.map((r, i) => ({ ...r, position: i + 1 }));
}

function applyResult(row, gf, ga, isLive) {
  row.played += 1;
  row.goals_for += gf;
  row.goals_against += ga;
  row.goal_diff = row.goals_for - row.goals_against;
  let letter;
  if (gf > ga) { row.won += 1; row.points += 3; letter = 'W'; }
  else if (gf === ga) { row.drawn += 1; row.points += 1; letter = 'G'; } // gelijk
  else { row.lost += 1; letter = 'V'; } // verlies
  row.form.push(isLive ? `${letter}*` : letter);
}

function compareHeadToHead(a, b, matches) {
  let ptsA = 0, ptsB = 0, gdA = 0, gdB = 0;
  for (const m of matches) {
    const pair =
      (m.home_team_id === a.team_id && m.away_team_id === b.team_id) ||
      (m.home_team_id === b.team_id && m.away_team_id === a.team_id);
    if (!pair) continue;
    const [idHome, gh, ga] = [m.home_team_id, m.home_score, m.away_score];
    const aIsHome = idHome === a.team_id;
    const gfA = aIsHome ? gh : ga;
    const gfB = aIsHome ? ga : gh;
    if (gfA > gfB) ptsA += 3; else if (gfB > gfA) ptsB += 3; else { ptsA += 1; ptsB += 1; }
    gdA += gfA - gfB;
    gdB += gfB - gfA;
  }
  return (ptsB - ptsA) || (gdB - gdA);
}

export function allStandings(opts) {
  const groups = {};
  for (const g of ['A1', 'A2', 'A3', 'A4']) groups[g] = computeGroupStandings(g, opts);
  return groups;
}

/** Extra context per team for the insights page. */
export function teamInsights(teamId) {
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
  if (!team) return null;

  const played = db.prepare(`
    SELECT m.*, th.name_nl AS home_name, th.flag AS home_flag,
           ta.name_nl AS away_name, ta.flag AS away_flag
    FROM matches m
    JOIN teams th ON th.id = m.home_team_id
    JOIN teams ta ON ta.id = m.away_team_id
    WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status = 'finished'
    ORDER BY m.kickoff_utc DESC LIMIT 5
  `).all(teamId, teamId);

  const next = db.prepare(`
    SELECT m.*, th.name_nl AS home_name, th.flag AS home_flag,
           ta.name_nl AS away_name, ta.flag AS away_flag
    FROM matches m
    JOIN teams th ON th.id = m.home_team_id
    JOIN teams ta ON ta.id = m.away_team_id
    WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status IN ('scheduled', 'live')
    ORDER BY m.kickoff_utc ASC LIMIT 1
  `).get(teamId, teamId);

  const standings = computeGroupStandings(team.group_name);
  const row = standings.find((r) => r.team_id === teamId) || null;

  const winnerQ = db.prepare('SELECT id FROM bonus_questions WHERE question_key = ?').get(`winner_${team.group_name}`);
  const pickedBy = winnerQ
    ? db.prepare(`
        SELECT u.display_name, u.avatar FROM bonus_answers ba
        JOIN users u ON u.id = ba.user_id
        WHERE ba.question_id = ? AND ba.answer_team_id = ?
      `).all(winnerQ.id, teamId)
    : [];

  const topScorers = db.prepare(`
    SELECT player_name, SUM(1) AS goals FROM match_events
    WHERE team_id = ? AND event_type IN ('goal', 'penalty')
    GROUP BY player_name ORDER BY goals DESC LIMIT 3
  `).all(teamId);

  return { team, standing: row, recent: played, next, picked_as_group_winner_by: pickedBy, top_scorers: topScorers };
}

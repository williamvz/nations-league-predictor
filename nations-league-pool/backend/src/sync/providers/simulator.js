// Demo-mode provider: no network, no real season needed. Generates a
// deterministic pretend season for whatever fixtures are in the database:
// matches go live at their (time-compressed) kickoff, tick through a
// SIM_MATCH_MINUTES-long "90 minutes" with goals by plausible players, and
// finish. Once the league phase completes it invents the knockout bracket
// (winners vs runners-up, two legs, then the Final Four) so the entire
// tournament — champion bonus included — plays out in about an hour.
import db from '../../db/database.js';
import { computeGroupStandings } from '../../services/standings.js';

export const SIM_MATCH_MINUTES = Number(process.env.SIM_MATCH_MINUTES || 4);

// enough household names per country to make the topscorer list feel real
const PLAYERS = {
  FRA: ['Kylian Mbappé', 'Antoine Griezmann', 'Ousmane Dembélé', 'Aurélien Tchouaméni'],
  ITA: ['Federico Chiesa', 'Gianluca Scamacca', 'Nicolò Barella', 'Mateo Retegui'],
  BEL: ['Romelu Lukaku', 'Kevin De Bruyne', 'Jérémy Doku', 'Leandro Trossard'],
  TUR: ['Arda Güler', 'Kenan Yıldız', 'Hakan Çalhanoğlu', 'Kerem Aktürkoğlu'],
  GER: ['Jamal Musiala', 'Florian Wirtz', 'Kai Havertz', 'Niclas Füllkrug'],
  NED: ['Memphis Depay', 'Cody Gakpo', 'Xavi Simons', 'Wout Weghorst'],
  SRB: ['Dušan Vlahović', 'Aleksandar Mitrović', 'Dušan Tadić', 'Sergej Milinković-Savić'],
  GRE: ['Giorgos Giakoumakis', 'Anastasios Bakasetas', 'Fotis Ioannidis', 'Christos Tzolis'],
  ESP: ['Lamine Yamal', 'Álvaro Morata', 'Nico Williams', 'Mikel Oyarzabal'],
  CRO: ['Luka Modrić', 'Andrej Kramarić', 'Bruno Petković', 'Mateo Kovačić'],
  ENG: ['Harry Kane', 'Jude Bellingham', 'Bukayo Saka', 'Phil Foden'],
  CZE: ['Patrik Schick', 'Adam Hložek', 'Tomáš Souček', 'Lukáš Provod'],
  POR: ['Cristiano Ronaldo', 'Rafael Leão', 'Bruno Fernandes', 'Gonçalo Ramos'],
  DEN: ['Rasmus Højlund', 'Christian Eriksen', 'Jonas Wind', 'Mikkel Damsgaard'],
  NOR: ['Erling Haaland', 'Alexander Sørloth', 'Martin Ødegaard', 'Antonio Nusa'],
  WAL: ['Brennan Johnson', 'Harry Wilson', 'Daniel James', 'Kieffer Moore'],
};

// deterministic PRNG so a rerun of the same demo produces the same season
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFor(match) {
  return match.id * 7919 + match.home_team_id * 131 + match.away_team_id;
}

/** Pre-generate the full storyline of one match: goals with sim-minutes. */
function storyline(match, teams) {
  const rnd = mulberry32(seedFor(match));
  const goals = [];
  for (const side of ['home', 'away']) {
    const teamId = side === 'home' ? match.home_team_id : match.away_team_id;
    const team = teams.get(teamId);
    const strengthBonus = side === 'home' ? 0.25 : 0;
    let n = 0;
    const roll = rnd();
    if (roll < 0.22 - strengthBonus * 0.2) n = 0;
    else if (roll < 0.55) n = 1;
    else if (roll < 0.82) n = 2;
    else if (roll < 0.95) n = 3;
    else n = 4;
    for (let i = 0; i < n; i++) {
      const names = PLAYERS[team.code] || [`Speler ${team.code}`];
      goals.push({
        minute: 1 + Math.floor(rnd() * 90),
        player: names[Math.floor(rnd() * names.length)],
        teamName: team.name_en,
        side,
        penalty: rnd() < 0.12,
        ownGoal: false,
      });
    }
  }
  goals.sort((a, b) => a.minute - b.minute);
  return goals;
}

function teamsById() {
  return new Map(db.prepare('SELECT * FROM teams').all().map((t) => [t.id, t]));
}

/** Simulated events for every fixture that has (time-compressed) kicked off. */
export function fetchSimulatedEvents() {
  const teams = teamsById();
  const now = Date.now();
  const matches = db.prepare(`
    SELECT * FROM matches WHERE datetime(kickoff_utc) <= datetime('now') AND status != 'postponed'
  `).all();

  const events = [];
  for (const m of matches) {
    const elapsedMs = now - new Date(m.kickoff_utc).getTime();
    const simMinute = Math.floor((elapsedMs / (SIM_MATCH_MINUTES * 60000)) * 90);
    const goals = storyline(m, teams);
    const visible = goals.filter((g) => g.minute <= Math.min(simMinute, 90));
    const home = teams.get(m.home_team_id);
    const away = teams.get(m.away_team_id);
    const homeScore = visible.filter((g) => g.side === 'home').length;
    const awayScore = visible.filter((g) => g.side === 'away').length;
    const finished = simMinute >= 90;

    // knockout matches can't end level: deterministic shootout winner
    let winnerName = null;
    if (finished && m.stage !== 'league' && homeScore === awayScore) {
      winnerName = mulberry32(seedFor(m) + 1)() < 0.5 ? home.name_en : away.name_en;
    }

    events.push({
      providerId: `sim-${m.id}`,
      homeName: home.name_en,
      awayName: away.name_en,
      homeScore,
      awayScore,
      status: finished ? 'finished' : 'live',
      minute: finished ? null : `${Math.max(1, Math.min(simMinute, 90))}'`,
      kickoffIso: m.kickoff_utc,
      winnerName,
      goals: visible.map((g) => ({
        player: g.player, teamName: g.teamName, minute: `${g.minute}'`,
        ownGoal: g.ownGoal, penalty: g.penalty,
      })),
    });
  }

  events.push(...nextKnockoutEvents(teams));
  return events;
}

/**
 * Invent the next knockout round once the previous stage is complete.
 * QF pairings: winner Gx vs runner-up of the partner group (two legs);
 * semis from aggregate winners; then third place + final.
 */
function nextKnockoutEvents(teams) {
  const openLeague = db.prepare("SELECT COUNT(*) AS n FROM matches WHERE stage = 'league' AND status != 'finished'").get().n;
  if (openLeague > 0) return [];

  const mk = (homeId, awayId, stage, matchday, offsetMin) => ({
    providerId: `sim-ko-${stage}-${homeId}-${awayId}`,
    homeName: teams.get(homeId).name_en,
    awayName: teams.get(awayId).name_en,
    homeScore: null, awayScore: null,
    status: 'scheduled', minute: null,
    kickoffIso: new Date(Date.now() + offsetMin * 60000).toISOString(),
    stage, matchday, goals: [],
  });

  const qfs = db.prepare("SELECT * FROM matches WHERE stage = 'quarterfinal'").all();
  if (qfs.length === 0) {
    const winners = {}, runners = {};
    for (const g of ['A1', 'A2', 'A3', 'A4']) {
      const s = computeGroupStandings(g);
      winners[g] = s[0].team_id;
      runners[g] = s[1].team_id;
    }
    const pairs = [
      [winners.A1, runners.A2], [winners.A2, runners.A1],
      [winners.A3, runners.A4], [winners.A4, runners.A3],
    ];
    const events = [];
    pairs.forEach(([w, r], i) => {
      events.push(mk(r, w, 'quarterfinal', 7, 2 + i)); // first leg: runner-up at home
      events.push(mk(w, r, 'quarterfinal', 8, 2 + i + SIM_MATCH_MINUTES + 3));
    });
    return events;
  }

  const qfOpen = qfs.some((m) => m.status !== 'finished');
  if (qfOpen) return [];

  // aggregate winners of the four ties
  const byPair = new Map();
  for (const m of qfs) {
    const key = [m.home_team_id, m.away_team_id].sort((a, b) => a - b).join('-');
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(m);
  }
  const advancers = [];
  for (const legs of byPair.values()) {
    const [a, b] = [legs[0].home_team_id, legs[0].away_team_id];
    let goalsA = 0, goalsB = 0;
    for (const leg of legs) {
      goalsA += leg.home_team_id === a ? leg.home_score : leg.away_score;
      goalsB += leg.home_team_id === b ? leg.home_score : leg.away_score;
    }
    if (goalsA === goalsB) {
      const last = legs[legs.length - 1];
      advancers.push(last.winner_team_id || a);
    } else {
      advancers.push(goalsA > goalsB ? a : b);
    }
  }

  const finalsExisting = db.prepare("SELECT * FROM matches WHERE stage IN ('semifinal', 'third_place', 'final')").all();
  if (finalsExisting.length === 0 && advancers.length === 4) {
    return [
      mk(advancers[0], advancers[1], 'semifinal', 9, 2),
      mk(advancers[2], advancers[3], 'semifinal', 9, 3),
    ];
  }

  const semis = finalsExisting.filter((m) => m.stage === 'semifinal');
  const semisDone = semis.length === 2 && semis.every((m) => m.status === 'finished');
  const hasFinal = finalsExisting.some((m) => m.stage === 'final' || m.stage === 'third_place');
  if (semisDone && !hasFinal) {
    const result = (m) => {
      if (m.home_score !== m.away_score) {
        const w = m.home_score > m.away_score ? m.home_team_id : m.away_team_id;
        return { winner: w, loser: w === m.home_team_id ? m.away_team_id : m.home_team_id };
      }
      const w = m.winner_team_id || m.home_team_id;
      return { winner: w, loser: w === m.home_team_id ? m.away_team_id : m.home_team_id };
    };
    const r1 = result(semis[0]);
    const r2 = result(semis[1]);
    return [
      mk(r1.loser, r2.loser, 'third_place', 9, 2),
      mk(r1.winner, r2.winner, 'final', 9, 2 + SIM_MATCH_MINUTES + 2),
    ];
  }
  return [];
}

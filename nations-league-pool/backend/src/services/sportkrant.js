// De Sportkrant 📰 — an automatically written Dutch recap of every matchday,
// generated purely from pool data (no AI, no API keys, nothing to maintain).
// Phrasing is picked deterministically per matchday so the article doesn't
// change when you re-read it.
import db from '../db/database.js';
import { broadcast } from './notify.js';
import { sendPush } from './push.js';

function rngFor(matchday) {
  let a = (matchday * 2654435761) >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

const ROUND_NAMES = {
  7: 'de heenduels van de kwartfinales',
  8: 'de returns van de kwartfinales',
  9: 'de Final Four',
};

function roundName(md) {
  return ROUND_NAMES[md] || `speelronde ${md}`;
}

/** All the raw facts the newsroom needs for one matchday. */
function gatherFacts(matchday) {
  const snaps = db.prepare(`
    SELECT s.*, u.display_name, u.avatar FROM matchday_snapshots s
    JOIN users u ON u.id = s.user_id WHERE s.matchday = ? ORDER BY s.rank ASC
  `).all(matchday);
  const prev = new Map(
    db.prepare('SELECT user_id, rank FROM matchday_snapshots WHERE matchday = (SELECT MAX(matchday) FROM matchday_snapshots WHERE matchday < ?)')
      .all(matchday).map((s) => [s.user_id, s.rank])
  );
  const matches = db.prepare(`
    SELECT m.*, th.name_nl AS home_name, th.flag AS home_flag, ta.name_nl AS away_name, ta.flag AS away_flag,
      (SELECT COUNT(*) FROM predictions p WHERE p.match_id = m.id) AS pred_count,
      (SELECT COUNT(*) FROM predictions p WHERE p.match_id = m.id AND p.points > 0) AS scored_count
    FROM matches m JOIN teams th ON th.id = m.home_team_id JOIN teams ta ON ta.id = m.away_team_id
    WHERE m.matchday = ? AND m.status = 'finished' ORDER BY m.kickoff_utc
  `).all(matchday);
  const jokers = db.prepare(`
    SELECT p.points, u.display_name, th.name_nl AS home_name, ta.name_nl AS away_name, m.home_score, m.away_score
    FROM predictions p
    JOIN users u ON u.id = p.user_id AND u.status = 'active'
    JOIN matches m ON m.id = p.match_id AND m.matchday = ?
    JOIN teams th ON th.id = m.home_team_id JOIN teams ta ON ta.id = m.away_team_id
    WHERE p.is_joker = 1 AND p.points IS NOT NULL
    ORDER BY p.points DESC
  `).all(matchday);
  const forgetters = db.prepare(`
    SELECT u.display_name, COUNT(m.id) AS missed
    FROM users u
    JOIN matches m ON m.matchday = ? AND m.status = 'finished'
    LEFT JOIN predictions p ON p.match_id = m.id AND p.user_id = u.id
    WHERE u.status = 'active' AND p.id IS NULL
    GROUP BY u.id HAVING missed > 0 ORDER BY missed DESC
  `).all(matchday);
  const exacts = db.prepare(`
    SELECT u.display_name, COUNT(*) AS n
    FROM predictions p
    JOIN users u ON u.id = p.user_id AND u.status = 'active'
    JOIN matches m ON m.id = p.match_id AND m.matchday = ? AND m.status = 'finished'
    WHERE p.home_goals = m.home_score AND p.away_goals = m.away_score
    GROUP BY p.user_id ORDER BY n DESC
  `).all(matchday);
  return { snaps, prev, matches, jokers, forgetters, exacts };
}

/** Compose the article. Returns null when there is nothing to write about. */
export function composeRecap(matchday) {
  const { snaps, prev, matches, jokers, forgetters, exacts } = gatherFacts(matchday);
  if (snaps.length === 0 || matches.length === 0) return null;
  const rnd = rngFor(matchday);
  const p = [];

  // 1. the day winner
  const byRoundPts = [...snaps].sort((a, b) => b.matchday_points - a.matchday_points);
  const winner = byRoundPts[0];
  if (winner && winner.matchday_points > 0) {
    const exactLine = exacts.find((e) => e.display_name === winner.display_name);
    p.push(pick(rnd, [
      `${winner.avatar} **${winner.display_name}** pakt ${roundName(matchday)} met ${winner.matchday_points} punten${exactLine ? ` (${exactLine.n}× exact!)` : ''}. Applaus. 👏`,
      `De ronde-overwinning gaat naar ${winner.avatar} **${winner.display_name}**: ${winner.matchday_points} punten${exactLine ? ` en ${exactLine.n} exacte uitslagen` : ''}. De rest mag zich schamen.`,
      `${winner.avatar} **${winner.display_name}** keek deze ronde in een glazen bol: ${winner.matchday_points} punten${exactLine ? `, waarvan ${exactLine.n}× exact` : ''}. 🔮`,
    ]));
  }

  // 2. leader (change)
  const leader = snaps[0];
  const prevLeaderId = [...prev.entries()].find(([, r]) => r === 1)?.[0];
  if (leader) {
    if (prev.size === 0) {
      p.push(pick(rnd, [
        `${leader.avatar} **${leader.display_name}** neemt als eerste de leiding met ${leader.total_points} punten.`,
        `De allereerste koploper heet ${leader.avatar} **${leader.display_name}** (${leader.total_points} punten).`,
      ]));
    } else if (prevLeaderId && prevLeaderId !== leader.user_id) {
      p.push(pick(rnd, [
        `🔥 Machtswisseling bovenin: **${leader.display_name}** is de nieuwe koploper met ${leader.total_points} punten!`,
        `🔥 Er staat een nieuwe naam op de troon: **${leader.display_name}** (${leader.total_points} punten). Wie doet er wat aan?`,
      ]));
    } else {
      p.push(pick(rnd, [
        `Bovenaan blijft ${leader.avatar} **${leader.display_name}** stevig op kop met ${leader.total_points} punten.`,
        `${leader.avatar} **${leader.display_name}** verdedigt de koppositie met succes: ${leader.total_points} punten totaal.`,
      ]));
    }
  }

  // 3. jokers: hero and/or tragedy
  const heroJoker = jokers.find((j) => j.points >= 10);
  if (heroJoker) {
    p.push(pick(rnd, [
      `🃏 De joker van **${heroJoker.display_name}** op ${heroJoker.home_name}–${heroJoker.away_name} was goud waard: ${heroJoker.points} punten.`,
      `🃏 Masterclass van **${heroJoker.display_name}**: joker op ${heroJoker.home_name}–${heroJoker.away_name}, kassa! (+${heroJoker.points})`,
    ]));
  }
  const flopJoker = [...jokers].reverse().find((j) => j.points === 0);
  if (flopJoker) {
    p.push(pick(rnd, [
      `🃏💥 Au. **${flopJoker.display_name}** zette de joker op ${flopJoker.home_name}–${flopJoker.away_name} (${flopJoker.home_score}–${flopJoker.away_score}) en kreeg… helemaal niks.`,
      `🃏💥 De joker van **${flopJoker.display_name}** op ${flopJoker.home_name}–${flopJoker.away_name} ontplofte in stijl: nul punten.`,
    ]));
  }

  // 4. climber & faller
  if (prev.size > 0) {
    const moved = snaps
      .map((s) => ({ ...s, delta: (prev.get(s.user_id) ?? s.rank) - s.rank }))
      .sort((a, b) => b.delta - a.delta);
    const climber = moved[0];
    const faller = moved[moved.length - 1];
    if (climber && climber.delta >= 2) {
      p.push(pick(rnd, [
        `📈 Raket van de ronde: **${climber.display_name}** klimt ${climber.delta} plekken naar #${climber.rank}.`,
        `📈 **${climber.display_name}** kruipt omhoog: ${climber.delta} plaatsen winst, nu #${climber.rank}.`,
      ]));
    }
    if (faller && faller.delta <= -2) {
      const prevRank = faller.rank + faller.delta;
      p.push(pick(rnd, [
        `📉 **${faller.display_name}** kukelt ${-faller.delta} plekken omlaag naar #${faller.rank}. Sterkte.`,
        `📉 Vrije val voor **${faller.display_name}**: van #${prevRank} naar #${faller.rank}. Volgende ronde beter.`,
      ]));
    }
  }

  // 5. the result nobody saw coming
  const withPreds = matches.filter((m) => m.pred_count > 0);
  if (withPreds.length > 0) {
    const shocker = [...withPreds].sort((a, b) => (a.scored_count / a.pred_count) - (b.scored_count / b.pred_count))[0];
    if (shocker && shocker.scored_count / shocker.pred_count <= 0.5) {
      const who = shocker.scored_count === 0 ? 'Niemand' : `Slechts ${shocker.scored_count} van de ${shocker.pred_count} spelers`;
      p.push(pick(rnd, [
        `😱 ${who} zag ${shocker.home_flag} ${shocker.home_name} ${shocker.home_score}–${shocker.away_score} ${shocker.away_name} ${shocker.away_flag} aankomen.`,
        `😱 De stunt van de ronde: ${shocker.home_name} ${shocker.home_score}–${shocker.away_score} ${shocker.away_name}. ${who} had er punten aan.`,
      ]));
    }
  }

  // 6. zeroes and forgetters
  const zeroes = snaps.filter((s) => s.matchday_points === 0);
  if (zeroes.length > 0 && zeroes.length <= 3) {
    const names = zeroes.map((z) => `**${z.display_name}**`).join(' en ');
    p.push(pick(rnd, [
      `🥶 ${names} ble${zeroes.length === 1 ? 'ef' : 'ven'} steken op nul punten deze ronde.`,
      `🥶 Een rondje stilte voor ${names}: nul punten.`,
    ]));
  }
  const forgetter = forgetters[0];
  if (forgetter) {
    p.push(pick(rnd, [
      `😴 **${forgetter.display_name}** vergat ${forgetter.missed} wedstrijd${forgetter.missed === 1 ? '' : 'en'} in te vullen. Zonde, zonde, zonde.`,
      `😴 Wekker zetten, **${forgetter.display_name}**! ${forgetter.missed} wedstrijd${forgetter.missed === 1 ? '' : 'en'} niet ingevuld.`,
    ]));
  }

  // 7. sign-off
  p.push(pick(rnd, [
    `Tot de volgende ronde — om de eeuwige roem! 😤`,
    `De teller loopt door. Wie pakt de eeuwige roem? 🏆`,
    `Voorspellen kan weer voor de volgende ronde. Scherp blijven! ⚽`,
  ]));

  const title = `📰 De Sportkrant · ${roundName(matchday).charAt(0).toUpperCase() + roundName(matchday).slice(1)}`;
  return { title, body: p.join('\n\n') };
}

/** Generate, store and announce the recap for a finalized matchday. */
export function publishRecap(matchday) {
  if (db.prepare('SELECT 1 FROM recaps WHERE matchday = ?').get(matchday)) return false;
  const recap = composeRecap(matchday);
  if (!recap) return false;
  db.prepare('INSERT INTO recaps (matchday, title, body) VALUES (?, ?, ?)').run(matchday, recap.title, recap.body);
  const teaser = recap.body.split('\n\n')[0].replaceAll('**', '');
  broadcast('sportkrant', recap.title, `${teaser} Lees verder in de app → Meer → Sportkrant`);
  sendPush(null, { title: recap.title, body: teaser, url: './#/sportkrant' }).catch(() => {});
  return true;
}

// Demo-mode match details: a deterministic, plausible set of statistics,
// timeline, line-ups, live commentary and a post-match recap, shaped exactly
// like the normalized ESPN summary (see parseSummary in espn.js), so the
// match screen can be demoed without any network.

const FIRST = ['Daan', 'Luca', 'Milan', 'Noah', 'Sem', 'Finn', 'Levi', 'Jesse', 'Thijs', 'Bram', 'Ruben', 'Stijn', 'Tim', 'Joris', 'Koen', 'Lars'];
const LAST = ['de Wit', 'Bakker', 'Visser', 'Smit', 'Meijer', 'Mulder', 'de Groot', 'Bos', 'Vos', 'Peters', 'Hendriks', 'Dekker', 'Brouwer', 'Kok', 'Jacobs', 'Vermeulen'];
const SHAPE = ['G', 'D', 'D', 'D', 'D', 'M', 'M', 'M', 'F', 'F', 'F'];
const VENUES = {
  FRA: ['Stade de France', 'Saint-Denis'], ITA: ['Stadio Olimpico', 'Rome'], BEL: ['Koning Boudewijnstadion', 'Brussel'],
  TUR: ['Atatürk Olympisch Stadion', 'Istanbul'], GER: ['Allianz Arena', 'München'], NED: ['Johan Cruijff ArenA', 'Amsterdam'],
  SRB: ['Rajko Mitić Stadion', 'Belgrado'], GRE: ['OAKA Spyros Louis', 'Athene'], ESP: ['Estadio Metropolitano', 'Madrid'],
  CRO: ['Stadion Maksimir', 'Zagreb'], ENG: ['Wembley Stadium', 'Londen'], CZE: ['Fortuna Arena', 'Praag'],
  POR: ['Estádio da Luz', 'Lissabon'], DEN: ['Parken', 'Kopenhagen'], NOR: ['Ullevaal Stadion', 'Oslo'], WAL: ['Cardiff City Stadium', 'Cardiff'],
};
const REFEREES = ['Danny Makkelie', 'Szymon Marciniak', 'Clément Turpin', 'Anthony Taylor', 'Daniele Orsato', 'Felix Zwayer', 'Slavko Vinčić'];

const FILLER = [
  (t) => `${t} houdt de bal rustig in de ploeg, geduldig opbouwen vanuit achteren.`,
  (t) => `Hoekschop voor ${t}, maar de kopbal gaat over.`,
  (t) => `Afstandsschot namens ${t}, ruim naast.`,
  (t) => `${t} zet druk op de opbouw van de tegenstander.`,
  (t) => `Vrije trap voor ${t} op de rand van de zestien… recht in de muur.`,
  (t) => `Mooie combinatie van ${t} over rechts, de voorzet wordt weggewerkt.`,
  (t) => `Buitenspel. De vlag van de assistent gaat omhoog tegen ${t}.`,
];

export function squad(team, rnd, knownPlayers) {
  const used = new Set();
  const pick = () => {
    for (;;) {
      const n = `${FIRST[Math.floor(rnd() * FIRST.length)]} ${LAST[Math.floor(rnd() * LAST.length)]}`;
      if (!used.has(n)) { used.add(n); return n; }
    }
  };
  const stars = [...knownPlayers];
  const starters = SHAPE.map((pos, i) => {
    // the famous names play up front / in midfield
    const name = (pos === 'F' || pos === 'M') && stars.length ? stars.shift() : pick();
    used.add(name);
    return { name, jersey: String(i === 0 ? 1 : i + 1), position: pos, starter: true, subbedIn: false, subbedOut: false, place: i + 1 };
  });
  const bench = Array.from({ length: 7 }, (_, i) => ({
    name: i === 0 ? pick() : stars.shift() || pick(),
    jersey: String(12 + i), position: i === 0 ? 'G' : ['D', 'M', 'F'][i % 3], starter: false, subbedIn: false, subbedOut: false, place: null,
  }));
  return { starters, bench };
}

/**
 * @param ctx { match, home, away, goals, simMinute, homeScore, awayScore, finished, winnerName, rnd, players }
 *   goals: full storyline [{minute, player, side, penalty}] (only those <= simMinute are shown)
 */
export function simulateDetails({ match, home, away, goals, simMinute, homeScore, awayScore, finished, winnerName, rnd, players, simMatchMinutes = 4 }) {
  const now = Math.min(simMinute, 90);
  const frac = Math.max(now, 1) / 90;
  const sides = { home, away };
  const lineups = { home: squad(home, rnd, players[home.code] || []), away: squad(away, rnd, players[away.code] || []) };
  lineups.home.formation = '4-3-3';
  lineups.away.formation = rnd() < 0.5 ? '4-3-3' : '4-2-3-1';

  // --- events beyond goals: cards, subs, a VAR check --------------------------
  const extra = [];
  for (const side of ['home', 'away']) {
    const nCards = Math.floor(rnd() * 4);
    for (let i = 0; i < nCards; i++) {
      const p = lineups[side].starters[1 + Math.floor(rnd() * 10)];
      extra.push({ minute: 10 + Math.floor(rnd() * 80), kind: rnd() < 0.06 ? 'red_card' : 'yellow_card', side, player: p.name });
    }
    const subMinutes = [58, 67, 76].map((m) => m + Math.floor(rnd() * 8));
    subMinutes.forEach((minute, i) => {
      const out = lineups[side].starters[10 - i];
      const inn = lineups[side].bench[1 + i];
      extra.push({ minute, kind: 'substitution', side, player: inn.name, related: out.name });
    });
  }
  if (rnd() < 0.35) extra.push({ minute: 20 + Math.floor(rnd() * 60), kind: 'var', side: rnd() < 0.5 ? 'home' : 'away', player: null });

  const all = [
    ...goals.map((g) => ({ minute: g.minute, kind: g.penalty ? 'penalty_goal' : 'goal', side: g.side, player: g.player, related: null })),
    ...extra,
  ].sort((a, b) => a.minute - b.minute);
  const visible = all.filter((e) => e.minute <= now);

  // apply visible substitutions to the line-up flags
  for (const e of visible) {
    if (e.kind !== 'substitution') continue;
    const l = lineups[e.side];
    const inn = l.bench.find((p) => p.name === e.player);
    const out = l.starters.find((p) => p.name === e.related);
    if (inn) inn.subbedIn = true;
    if (out) out.subbedOut = true;
  }

  const timeline = [];
  let n = 0;
  for (const e of visible) {
    if (e.minute > 45 && !timeline.some((t) => t.text === 'Halftime') && now > 45) {
      timeline.push({ id: `sim-ht`, kind: 'period', minute: "45'", side: null, player: null, related: null, text: 'Halftime' });
    }
    timeline.push({ id: `sim-${n++}`, kind: e.kind, minute: `${e.minute}'`, side: e.side, player: e.player, related: e.related ?? null, text: null });
  }
  if (now > 45 && !timeline.some((t) => t.text === 'Halftime')) {
    timeline.push({ id: 'sim-ht', kind: 'period', minute: "45'", side: null, player: null, related: null, text: 'Halftime' });
  }
  if (finished) timeline.push({ id: 'sim-ft', kind: 'period', minute: "90'", side: null, player: null, related: null, text: 'Full Time' });

  // --- statistics grow with the clock ------------------------------------------
  const possHome = Math.round(40 + rnd() * 20);
  const count = (side, kind) => visible.filter((e) => e.side === side && e.kind === kind).length;
  const goalsOf = (side) => visible.filter((e) => e.side === side && (e.kind === 'goal' || e.kind === 'penalty_goal')).length;
  const stat = (base) => Math.round(base * frac);
  const perSide = (side) => {
    const poss = side === 'home' ? possHome : 100 - possHome;
    const onTarget = Math.max(goalsOf(side), stat(2 + rnd() * 5));
    const shots = onTarget + stat(3 + rnd() * 8);
    const passes = stat(poss * 9 + rnd() * 60);
    const accurate = Math.round(passes * (0.78 + rnd() * 0.12));
    return {
      possessionPct: poss, totalShots: shots, shotsOnTarget: onTarget, wonCorners: stat(1 + rnd() * 8),
      foulsCommitted: stat(6 + rnd() * 10), yellowCards: count(side, 'yellow_card'), redCards: count(side, 'red_card'),
      offsides: stat(rnd() * 4), saves: 0, accuratePasses: accurate, totalPasses: passes,
      passPct: passes ? Math.round((accurate / passes) * 100) : 0, totalCrosses: stat(5 + rnd() * 15),
      totalTackles: stat(8 + rnd() * 12), interceptions: stat(3 + rnd() * 8),
    };
  };
  const h = perSide('home');
  const a = perSide('away');
  h.saves = Math.max(0, a.shotsOnTarget - goalsOf('away'));
  a.saves = Math.max(0, h.shotsOnTarget - goalsOf('home'));
  const stats = Object.keys(h).map((key) => ({ key, home: h[key], away: a[key] }));

  // --- commentary ---------------------------------------------------------------
  const name = (side) => sides[side].name_nl;
  const line = (e) => {
    switch (e.kind) {
      case 'goal': return `GOAL! ${name(e.side)} scoort! ${e.player} maakt hem af. ${e.side === 'home' ? 'Het publiek ontploft!' : 'Stilte op de tribunes.'}`;
      case 'penalty_goal': return `GOAL! ${e.player} benut de strafschop koelbloedig voor ${name(e.side)}.`;
      case 'yellow_card': return `Gele kaart voor ${e.player} (${name(e.side)}) na een late tackle.`;
      case 'red_card': return `ROOD! ${e.player} (${name(e.side)}) moet eruit. Dat is een flinke domper.`;
      case 'substitution': return `Wissel bij ${name(e.side)}: ${e.player} komt in het veld voor ${e.related}.`;
      case 'var': return `VAR-check… na een lange blik op de beelden blijft de beslissing van de scheidsrechter staan.`;
      default: return null;
    }
  };
  const commentary = [];
  let seq = 0;
  commentary.push({ seq: seq++, minute: "1'", text: `Aftrap! ${name('home')} tegen ${name('away')} is begonnen.`, kind: 'period' });
  for (let m = 1; m <= now; m++) {
    for (const e of visible.filter((x) => x.minute === m)) {
      const text = line(e);
      if (text) commentary.push({ seq: seq++, minute: `${m}'`, text, kind: e.kind });
    }
    if (m % 7 === 3) {
      const side = rnd() < possHome / 100 ? 'home' : 'away';
      commentary.push({ seq: seq++, minute: `${m}'`, text: FILLER[Math.floor(rnd() * FILLER.length)](name(side)), kind: null });
    }
    if (m === 45 && now > 45) commentary.push({ seq: seq++, minute: "45'", text: 'Rust. De spelers zoeken de kleedkamer op.', kind: 'period' });
  }
  if (finished) {
    commentary.push({ seq: seq++, minute: "90'", text: `Einde wedstrijd: ${name('home')} ${homeScore}–${awayScore} ${name('away')}.`, kind: 'period' });
  }
  // real moment of each line in the time-compressed demo season, so the TV
  // feed can interleave matches with different kickoffs correctly
  const kickoffMs = new Date(match.kickoff_utc).getTime();
  const msPerMinute = (simMatchMinutes * 60_000) / 90;
  for (const c of commentary) c.seen = Math.round(kickoffMs + (parseInt(c.minute, 10) || 0) * msPerMinute + c.seq);
  commentary.sort((x, y) => y.seq - x.seq);

  // --- venue ------------------------------------------------------------------
  const [venue, city] = VENUES[home.code] || ['Nationaal Stadion', ''];
  const info = { venue, city, attendance: 30000 + Math.floor(rnd() * 45000), referee: REFEREES[Math.floor(rnd() * REFEREES.length)] };

  // --- recap after the final whistle -------------------------------------------
  let article = null;
  if (finished) {
    const scorers = visible.filter((e) => e.kind === 'goal' || e.kind === 'penalty_goal');
    const winner = homeScore > awayScore ? 'home' : awayScore > homeScore ? 'away' : null;
    const headline = winner
      ? `${name(winner)} wint van ${name(winner === 'home' ? 'away' : 'home')}`
      : `${name('home')} en ${name('away')} houden elkaar in evenwicht`;
    const p = [];
    p.push(`${info.venue} zag ${name('home')} en ${name('away')} de strijd aangaan in de Nations League, en na negentig minuten stond er ${homeScore}–${awayScore} op het scorebord.`);
    if (scorers.length) {
      p.push(`De doelpunten: ${scorers.map((s) => `${s.player} (${s.minute}')`).join(', ')}.`);
    } else {
      p.push('Doelpunten bleven uit; beide defensies hielden de rijen gesloten.');
    }
    p.push(`${name(possHome >= 50 ? 'home' : 'away')} had met ${Math.max(possHome, 100 - possHome)}% het meeste balbezit en loste in totaal ${possHome >= 50 ? h.totalShots : a.totalShots} schoten.`);
    if (winnerName) p.push(`Omdat het gelijk bleef, moest de beslissing vallen na strafschoppen: ${winnerName} gaat door.`);
    p.push(`Scheidsrechter ${info.referee} leidde het duel voor ${info.attendance.toLocaleString('nl-NL')} toeschouwers.`);
    article = { headline, description: p[0], paragraphs: p, url: null, published: new Date().toISOString() };
  }

  return {
    status: finished ? 'finished' : 'live',
    stats,
    timeline,
    lineups,
    commentary: commentary.slice(0, 200),
    info,
    article,
    h2h: [],
  };
}

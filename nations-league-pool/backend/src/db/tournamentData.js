// UEFA Nations League 2026/27 — League A
// Draw: Brussels, 12 February 2026. League phase: 24 September – 17 November 2026.
// Fixtures verified against UEFA.com / englandfootball.com / faw.cymru (Feb 2026).
// Kickoff times are provisional where kickoff_confirmed is false — the fixture
// sync job corrects date/time from the data provider once available.

export const SEASON = '2026-27';

// ESPN league slug + TheSportsDB league id for the sync engine
export const PROVIDER_IDS = {
  espnLeague: 'uefa.nations',
  sportsDbLeagueId: '4490',
};

export const TEAMS = [
  // group A1
  { code: 'FRA', nameNl: 'Frankrijk',  nameEn: 'France',      group: 'A1', flag: '🇫🇷' },
  { code: 'ITA', nameNl: 'Italië',     nameEn: 'Italy',       group: 'A1', flag: '🇮🇹' },
  { code: 'BEL', nameNl: 'België',     nameEn: 'Belgium',     group: 'A1', flag: '🇧🇪' },
  { code: 'TUR', nameNl: 'Turkije',    nameEn: 'Türkiye',     group: 'A1', flag: '🇹🇷', aliases: ['Turkey'] },
  // group A2
  { code: 'GER', nameNl: 'Duitsland',  nameEn: 'Germany',     group: 'A2', flag: '🇩🇪' },
  { code: 'NED', nameNl: 'Nederland',  nameEn: 'Netherlands', group: 'A2', flag: '🇳🇱', aliases: ['Holland'] },
  { code: 'SRB', nameNl: 'Servië',     nameEn: 'Serbia',      group: 'A2', flag: '🇷🇸' },
  { code: 'GRE', nameNl: 'Griekenland', nameEn: 'Greece',     group: 'A2', flag: '🇬🇷' },
  // group A3
  { code: 'ESP', nameNl: 'Spanje',     nameEn: 'Spain',       group: 'A3', flag: '🇪🇸' },
  { code: 'CRO', nameNl: 'Kroatië',    nameEn: 'Croatia',     group: 'A3', flag: '🇭🇷' },
  { code: 'ENG', nameNl: 'Engeland',   nameEn: 'England',     group: 'A3', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { code: 'CZE', nameNl: 'Tsjechië',   nameEn: 'Czechia',     group: 'A3', flag: '🇨🇿', aliases: ['Czech Republic'] },
  // group A4
  { code: 'POR', nameNl: 'Portugal',   nameEn: 'Portugal',    group: 'A4', flag: '🇵🇹' },
  { code: 'DEN', nameNl: 'Denemarken', nameEn: 'Denmark',     group: 'A4', flag: '🇩🇰' },
  { code: 'NOR', nameNl: 'Noorwegen',  nameEn: 'Norway',      group: 'A4', flag: '🇳🇴' },
  { code: 'WAL', nameNl: 'Wales',      nameEn: 'Wales',       group: 'A4', flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿' },
];

// All times in Europe/Amsterdam local time. `confirmed: false` means the
// 20:45 default is a placeholder pending fixture sync.
const M = (matchday, date, time, home, away, confirmed = false) => ({
  matchday, date, time, home, away, kickoffConfirmed: confirmed,
});

export const MATCHES = [
  // ---- Matchday 1 (24–26 Sep 2026) ----
  M(1, '2026-09-24', '20:45', 'NED', 'GER'),
  M(1, '2026-09-24', '20:45', 'SRB', 'GRE'),
  M(1, '2026-09-24', '20:45', 'POR', 'WAL'),
  M(1, '2026-09-24', '20:45', 'NOR', 'DEN'),
  M(1, '2026-09-25', '20:45', 'ITA', 'BEL'),
  M(1, '2026-09-25', '20:45', 'TUR', 'FRA'),
  M(1, '2026-09-26', '20:45', 'ENG', 'ESP', true), // 19:45 BST, englandfootball.com
  M(1, '2026-09-26', '20:45', 'CZE', 'CRO'),
  // ---- Matchday 2 (27–29 Sep 2026) ----
  M(2, '2026-09-27', '18:00', 'SRB', 'NED', true),
  M(2, '2026-09-27', '20:45', 'GER', 'GRE'),
  M(2, '2026-09-27', '18:00', 'DEN', 'WAL', true),
  M(2, '2026-09-27', '20:45', 'NOR', 'POR'),
  M(2, '2026-09-28', '20:45', 'TUR', 'ITA'),
  M(2, '2026-09-28', '20:45', 'BEL', 'FRA'),
  M(2, '2026-09-29', '20:45', 'CZE', 'ENG', true), // 19:45 BST
  M(2, '2026-09-29', '20:45', 'ESP', 'CRO'),
  // ---- Matchday 3 (30 Sep – 3 Oct 2026) ----
  M(3, '2026-10-01', '20:45', 'GRE', 'NED'),
  M(3, '2026-10-01', '20:45', 'GER', 'SRB'),
  M(3, '2026-10-01', '20:45', 'WAL', 'NOR'),
  M(3, '2026-10-01', '20:45', 'DEN', 'POR'),
  M(3, '2026-10-02', '20:45', 'FRA', 'ITA'),
  M(3, '2026-10-02', '20:45', 'BEL', 'TUR'),
  M(3, '2026-10-03', '18:00', 'CRO', 'ENG', true), // 17:00 BST, behind closed doors (UEFA sanction)
  M(3, '2026-10-03', '20:45', 'ESP', 'CZE'),
  // ---- Matchday 4 (4–6 Oct 2026) ----
  M(4, '2026-10-04', '20:45', 'NED', 'SRB'),
  M(4, '2026-10-04', '20:45', 'GRE', 'GER'),
  M(4, '2026-10-04', '20:45', 'WAL', 'DEN'),
  M(4, '2026-10-04', '20:45', 'POR', 'NOR'),
  M(4, '2026-10-05', '20:45', 'ITA', 'TUR'),
  M(4, '2026-10-05', '20:45', 'FRA', 'BEL'),
  M(4, '2026-10-06', '20:45', 'ENG', 'CZE', true), // 19:45 BST
  M(4, '2026-10-06', '20:45', 'CRO', 'ESP'),
  // ---- Matchday 5 (12–14 Nov 2026) ----
  M(5, '2026-11-12', '20:45', 'ITA', 'FRA'),
  M(5, '2026-11-12', '18:00', 'TUR', 'BEL', true),
  M(5, '2026-11-12', '20:45', 'ENG', 'CRO', true), // 19:45 GMT
  M(5, '2026-11-12', '20:45', 'CZE', 'ESP'),
  M(5, '2026-11-13', '20:45', 'NED', 'GRE'),
  M(5, '2026-11-13', '20:45', 'SRB', 'GER'),
  M(5, '2026-11-14', '18:00', 'NOR', 'WAL', true),
  M(5, '2026-11-14', '20:45', 'POR', 'DEN'),
  // ---- Matchday 6 (15–17 Nov 2026) ----
  M(6, '2026-11-15', '20:45', 'BEL', 'ITA'),
  M(6, '2026-11-15', '20:45', 'FRA', 'TUR'),
  M(6, '2026-11-15', '20:45', 'ESP', 'ENG', true), // 19:45 GMT
  M(6, '2026-11-15', '20:45', 'CRO', 'CZE'),
  M(6, '2026-11-16', '20:45', 'GER', 'NED'),
  M(6, '2026-11-16', '20:45', 'GRE', 'SRB'),
  M(6, '2026-11-17', '20:45', 'WAL', 'POR'),
  M(6, '2026-11-17', '20:45', 'DEN', 'NOR'),
];

// Matchday windows drive both the prediction deadlines UI and the sync
// scheduler (polling only runs around match windows).
export const MATCHDAYS = [
  { number: 1, start: '2026-09-24', end: '2026-09-26' },
  { number: 2, start: '2026-09-27', end: '2026-09-29' },
  { number: 3, start: '2026-09-30', end: '2026-10-03' },
  { number: 4, start: '2026-10-04', end: '2026-10-06' },
  { number: 5, start: '2026-11-12', end: '2026-11-14' },
  { number: 6, start: '2026-11-15', end: '2026-11-17' },
];

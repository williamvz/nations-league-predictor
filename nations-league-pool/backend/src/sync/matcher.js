import db from '../db/database.js';

/** Normalize a team name for provider matching: lowercase, no diacritics. */
export function normalizeName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

let cache = null;

/** Map of normalized provider name → team row (built from names + aliases). */
export function teamLookup() {
  if (cache) return cache;
  cache = new Map();
  for (const t of db.prepare('SELECT * FROM teams').all()) {
    cache.set(normalizeName(t.name_en), t);
    cache.set(normalizeName(t.name_nl), t);
    for (const alias of JSON.parse(t.aliases || '[]')) cache.set(normalizeName(alias), t);
  }
  return cache;
}

export function findTeam(providerName) {
  return teamLookup().get(normalizeName(providerName)) || null;
}

/**
 * Find our match row for a provider event: by stored provider id first, then
 * by home/away team + kickoff within ±36h (fixtures can shift a day).
 */
export function findMatch(provider, providerId, homeTeam, awayTeam, kickoffIso) {
  if (providerId) {
    const byId = db.prepare(
      `SELECT * FROM matches WHERE json_extract(provider_ids, '$.' || ?) = ?`
    ).get(provider, String(providerId));
    if (byId) return byId;
  }
  if (!homeTeam || !awayTeam || !kickoffIso) return null;
  return db.prepare(`
    SELECT * FROM matches
    WHERE home_team_id = ? AND away_team_id = ?
      AND abs(strftime('%s', kickoff_utc) - strftime('%s', ?)) < 36 * 3600
  `).get(homeTeam.id, awayTeam.id, kickoffIso) || null;
}

export function rememberProviderId(matchId, provider, providerId) {
  if (!providerId) return;
  db.prepare(`
    UPDATE matches
    SET provider_ids = json_set(provider_ids, '$.' || ?, ?)
    WHERE id = ?
  `).run(provider, String(providerId), matchId);
}

// All timestamps in the DB are ISO 8601 UTC. The frontend renders them in
// Europe/Amsterdam. These helpers convert tournament wall-clock times
// (Amsterdam) to UTC, correctly across the October DST switch.

const TZ = 'Europe/Amsterdam';

const dtf = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
});

function wallClockAsUtcMs(date) {
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
}

/** Convert an Amsterdam wall-clock date+time to a UTC ISO string. */
export function amsterdamToUtc(dateStr, timeStr) {
  const guess = new Date(`${dateStr}T${timeStr}:00Z`);
  const offset = wallClockAsUtcMs(guess) - guess.getTime();
  return new Date(guess.getTime() - offset).toISOString();
}

const displayFmt = new Intl.DateTimeFormat('nl-NL', {
  timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
});

/** Human-readable Dutch date/time, e.g. "donderdag 24 september om 20:45". */
export function fmtAmsterdam(isoUtc) {
  return displayFmt.format(new Date(isoUtc)).replace(' om ', ' om ');
}

export function nowUtc() {
  return new Date().toISOString();
}

export function isPast(isoUtc) {
  return new Date(isoUtc).getTime() <= Date.now();
}

/** Minutes from now until the given instant (negative = in the past). */
export function minutesUntil(isoUtc) {
  return (new Date(isoUtc).getTime() - Date.now()) / 60000;
}

// Kickoffs are stored in UTC; always render them in Dutch time regardless of
// the viewer's device timezone (fixes the old app's countdown drift).
const TZ = 'Europe/Amsterdam';

const dayFmt = new Intl.DateTimeFormat('nl-NL', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('nl-NL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const fullFmt = new Intl.DateTimeFormat('nl-NL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

export function fmtDay(iso) {
  return dayFmt.format(new Date(iso));
}
export function fmtTime(iso) {
  return timeFmt.format(new Date(iso));
}
export function fmtFull(iso) {
  return fullFmt.format(new Date(iso));
}

export function fmtPoints(p) {
  if (p == null) return '';
  return Number.isInteger(p) ? String(p) : p.toFixed(1);
}

/** Group an array by a key function, preserving order. */
export function groupBy(arr, keyFn) {
  const out = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(item);
  }
  return out;
}

export function countdownParts(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    totalHours: s / 3600,
  };
}

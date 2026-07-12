import { useState } from 'react';
import { api } from '../services/api';
import { fmtDay, fmtTime, fmtPoints } from '../utils/format';
import { Countdown, LiveDot } from './ui';

function Stepper({ value, onChange, disabled }) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className="btn-ghost h-9 w-9 rounded-lg !p-0 text-lg"
        disabled={disabled || value <= 0}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <span className="w-8 text-center text-xl font-bold tabular-nums">{value}</span>
      <button
        type="button"
        className="btn-ghost h-9 w-9 rounded-lg !p-0 text-lg"
        disabled={disabled || value >= 20}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  );
}

function pointsBadge(points) {
  if (points == null) return null;
  const cls =
    points >= 5 ? 'bg-oranje-500/20 text-oranje-300' :
    points > 0 ? 'bg-emerald-500/15 text-emerald-300' :
    'bg-white/5 text-emerald-50/40';
  return <span className={`chip ${cls}`}>+{fmtPoints(points)}</span>;
}

/**
 * One match row with inline prediction editing (no modal needed — fast for
 * filling in a whole matchday from your phone).
 */
export default function MatchCard({ match, onSaved, onOpenDetail }) {
  const p = match.prediction;
  const [editing, setEditing] = useState(false);
  const [home, setHome] = useState(p?.home_goals ?? 1);
  const [away, setAway] = useState(p?.away_goals ?? 1);
  const [joker, setJoker] = useState(p?.is_joker === 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const locked = match.is_locked;
  const finished = match.status === 'finished';
  const live = match.status === 'live';

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.predict(match.id, home, away, joker);
      setEditing(false);
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`card p-4 ${live ? 'ring-1 ring-red-500/40' : ''}`}>
      <div className="mb-2 flex items-center justify-between text-xs text-emerald-50/50">
        <span>
          Groep {match.group_name} · Speelronde {match.matchday}
        </span>
        <span className="flex items-center gap-2">
          {live && <LiveDot />}
          {live && match.minute && <span className="font-semibold text-red-400">{match.minute}</span>}
          {!locked && <span>{fmtDay(match.kickoff_utc)} · {fmtTime(match.kickoff_utc)}</span>}
          {finished && <span>Afgelopen</span>}
        </span>
      </div>

      <button className="flex w-full items-center justify-between gap-2" onClick={() => onOpenDetail?.(match)}>
        <div className="flex flex-1 items-center justify-end gap-2 text-right">
          <span className="truncate font-semibold">{match.home_name}</span>
          <span className="text-2xl">{match.home_flag}</span>
        </div>
        <div className="min-w-[72px] text-center">
          {finished || live ? (
            <span className={`text-2xl font-black tabular-nums ${live ? 'text-red-400' : ''}`}>
              {match.home_score}–{match.away_score}
            </span>
          ) : (
            <span className="text-lg font-bold text-emerald-50/30">
              <Countdown iso={match.kickoff_utc} />
            </span>
          )}
        </div>
        <div className="flex flex-1 items-center gap-2">
          <span className="text-2xl">{match.away_flag}</span>
          <span className="truncate font-semibold">{match.away_name}</span>
        </div>
      </button>

      {/* prediction zone */}
      <div className="mt-3 border-t border-white/5 pt-3">
        {!locked && !editing && (
          <button className="flex w-full items-center justify-between" onClick={() => setEditing(true)}>
            {p ? (
              <span className="flex items-center gap-2 text-sm">
                <span className="text-emerald-50/50">Jouw voorspelling:</span>
                <span className="font-bold">{p.home_goals}–{p.away_goals}</span>
                {p.is_joker === 1 && <span className="chip bg-purple-500/20 text-purple-300">🃏 Joker</span>}
              </span>
            ) : (
              <span className="text-sm font-semibold text-oranje-400">→ Vul je voorspelling in</span>
            )}
            <span className="text-emerald-50/40">✏️</span>
          </button>
        )}

        {!locked && editing && (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-6">
              <Stepper value={home} onChange={setHome} disabled={saving} />
              <span className="text-xl font-bold text-emerald-50/40">–</span>
              <Stepper value={away} onChange={setAway} disabled={saving} />
            </div>
            <label className="flex items-center justify-center gap-2 text-sm text-emerald-50/70">
              <input
                type="checkbox"
                checked={joker}
                onChange={(e) => setJoker(e.target.checked)}
                className="h-4 w-4 accent-purple-500"
              />
              🃏 Joker — dubbele punten (1 per speelronde)
            </label>
            {error && <div className="text-center text-sm text-red-400">{error}</div>}
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setEditing(false)} disabled={saving}>
                Annuleer
              </button>
              <button className="btn-primary flex-1" onClick={save} disabled={saving}>
                {saving ? 'Opslaan…' : 'Opslaan'}
              </button>
            </div>
          </div>
        )}

        {locked && (
          <div className="flex items-center justify-between text-sm">
            {p ? (
              <span className="flex items-center gap-2">
                <span className="text-emerald-50/50">Jouw voorspelling:</span>
                <span className="font-bold">{p.home_goals}–{p.away_goals}</span>
                {p.is_joker === 1 && <span className="chip bg-purple-500/20 text-purple-300">🃏</span>}
                {pointsBadge(p.points)}
              </span>
            ) : (
              <span className="text-emerald-50/40">Geen voorspelling 😢</span>
            )}
            {match.community && match.community.total > 0 && (
              <span className="text-xs text-emerald-50/40">
                {match.community.home_wins}·{match.community.draws}·{match.community.away_wins} van {match.community.total}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

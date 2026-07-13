import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { api } from '../services/api';
import { Spinner } from '../components/ui';
import { fmtDay, fmtTime } from '../utils/format';
import { useT, matchContextT } from '../i18n';

function BigStepper({ value, onChange }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button className="btn-ghost h-12 w-12 rounded-xl !p-0 text-2xl" disabled={value >= 20} onClick={() => onChange(value + 1)}>+</button>
      <span className="text-5xl font-black tabular-nums">{value}</span>
      <button className="btn-ghost h-12 w-12 rounded-xl !p-0 text-2xl" disabled={value <= 0} onClick={() => onChange(value - 1)}>−</button>
    </div>
  );
}

/**
 * Blitz-invullen ⚡ — every open match as a full-screen card: thumb the
 * scores, save, next. A whole matchday done in half a minute.
 */
export default function Blitz() {
  const { t, tn } = useT();
  const navigate = useNavigate();
  const [queue, setQueue] = useState(null);
  const [idx, setIdx] = useState(0);
  const [home, setHome] = useState(1);
  const [away, setAway] = useState(1);
  const [joker, setJoker] = useState(false);
  const [jokerDays, setJokerDays] = useState(new Set());
  const [saved, setSaved] = useState(0);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.matches().then((d) => {
      const open = d.matches.filter((m) => !m.is_locked && !m.prediction);
      const days = new Set(
        d.matches.filter((m) => m.prediction?.is_joker === 1).map((m) => m.matchday)
      );
      setJokerDays(days);
      setQueue(open);
    }).catch(() => {});
  }, []);

  const done = queue !== null && idx >= queue.length;
  useEffectOnDone(done, saved); // hooks stay unconditional — before any early return

  if (!queue) return <Spinner />;
  const match = queue[idx];

  async function submit(withPrediction) {
    setError(null);
    if (withPrediction) {
      setBusy(true);
      try {
        await api.predict(match.id, home, away, joker);
        setSaved((n) => n + 1);
        if (joker) setJokerDays((s) => new Set(s).add(match.matchday));
      } catch (err) {
        setError(err.message);
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    setHome(1);
    setAway(1);
    setJoker(false);
    setIdx((i) => i + 1);
  }

  if (queue.length === 0 || done) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
        <div className="text-6xl">{queue.length === 0 ? '😎' : '🎉'}</div>
        <h1 className="mt-4 text-2xl font-black">
          {queue.length === 0 ? t('blitz.allDone') : t('blitz.done', { n: saved })}
        </h1>
        <p className="mt-2 text-emerald-50/50">
          {queue.length === 0 ? t('blitz.noneOpen') : t('blitz.noSurprise')}
        </p>
        <button className="btn-primary mt-6" onClick={() => navigate('/wedstrijden')}>{t('blitz.toMatches')}</button>
      </div>
    );
  }

  const jokerTaken = jokerDays.has(match.matchday);

  return (
    <div className="flex min-h-[75vh] flex-col">
      <div className="mb-4 flex items-center justify-between text-sm text-emerald-50/50">
        <span>{t('blitz.title')}</span>
        <span className="font-bold tabular-nums">{idx + 1} / {queue.length}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full bg-oranje-500 transition-all" style={{ width: `${(idx / queue.length) * 100}%` }} />
      </div>

      <div className="card mt-4 flex flex-1 flex-col items-center justify-center gap-5 p-6 text-center">
        <div className="text-xs text-emerald-50/50">
          {matchContextT(t, match)} · {fmtDay(match.kickoff_utc)} {fmtTime(match.kickoff_utc)}
        </div>

        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex flex-col items-center gap-2">
            <span className="text-6xl">{match.home_flag}</span>
            <span className="font-bold">{tn(match.home_code, match.home_name)}</span>
            <BigStepper value={home} onChange={setHome} />
          </div>
          <span className="text-3xl font-black text-emerald-50/30">–</span>
          <div className="flex flex-col items-center gap-2">
            <span className="text-6xl">{match.away_flag}</span>
            <span className="font-bold">{tn(match.away_code, match.away_name)}</span>
            <BigStepper value={away} onChange={setAway} />
          </div>
        </div>

        <label className={`flex items-center gap-2 text-sm ${jokerTaken ? 'opacity-40' : ''}`}>
          <input
            type="checkbox"
            className="h-4 w-4 accent-purple-500"
            checked={joker}
            disabled={jokerTaken}
            onChange={(e) => setJoker(e.target.checked)}
          />
          {jokerTaken ? t('blitz.jokerUsed') : t('blitz.joker')}
        </label>

        {error && <div className="text-sm text-red-400">{error}</div>}

        <div className="flex w-full gap-2">
          <button className="btn-ghost flex-1" onClick={() => submit(false)} disabled={busy}>{t('blitz.skip')}</button>
          <button className="btn-primary flex-[2]" onClick={() => submit(true)} disabled={busy}>
            {busy ? t('common.saving') : t('blitz.saveNext')}
          </button>
        </div>
      </div>
    </div>
  );
}

function useEffectOnDone(done, saved) {
  useEffect(() => {
    if (done && saved > 0) {
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors: ['#ff7a00', '#ffb267', '#f4fff8'] });
    }
  }, [done, saved]);
}

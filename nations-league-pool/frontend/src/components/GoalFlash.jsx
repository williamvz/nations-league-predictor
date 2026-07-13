import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { api } from '../services/api';

/**
 * Full-screen GOAL takeover: polls the live matches, detects score changes
 * and celebrates for a few seconds — confetti cannon, giant flag, scorer,
 * and a phone buzz. Baseline poll is silent so opening the app mid-match
 * doesn't fire a fake celebration.
 */
export default function GoalFlash({ intervalMs = 25_000 }) {
  const [goal, setGoal] = useState(null);
  const prev = useRef(null); // matchId -> {h, a}
  const timer = useRef(null);

  useEffect(() => {
    let stop = false;

    async function poll() {
      try {
        const { matches } = await api.live();
        if (stop) return;
        const seen = prev.current;
        const next = new Map();
        for (const m of matches) next.set(m.id, { h: m.home_score ?? 0, a: m.away_score ?? 0 });

        if (seen) {
          for (const m of matches) {
            const before = seen.get(m.id);
            if (!before) continue;
            const homeScored = (m.home_score ?? 0) > before.h;
            const awayScored = (m.away_score ?? 0) > before.a;
            if (homeScored || awayScored) {
              celebrate({
                flag: homeScored ? m.home_flag : m.away_flag,
                team: homeScored ? m.home_name : m.away_name,
                score: `${m.home_score}–${m.away_score}`,
                fixture: `${m.home_name} – ${m.away_name}`,
                minute: m.minute,
              });
              break; // one celebration at a time is plenty
            }
          }
        }
        prev.current = next;
      } catch {
        /* offline — no drama */
      }
    }

    function celebrate(g) {
      setGoal(g);
      try {
        navigator.vibrate?.([120, 60, 120, 60, 240]);
      } catch { /* not supported */ }
      const end = Date.now() + 1800;
      (function frame() {
        confetti({ particleCount: 8, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors: ['#ff7a00', '#ffb267', '#f4fff8'] });
        confetti({ particleCount: 8, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors: ['#ff7a00', '#ffb267', '#f4fff8'] });
        if (Date.now() < end) requestAnimationFrame(frame);
      })();
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setGoal(null), 6000);
    }

    poll();
    const t = setInterval(poll, intervalMs);
    return () => {
      stop = true;
      clearInterval(t);
      clearTimeout(timer.current);
    };
  }, [intervalMs]);

  if (!goal) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={() => setGoal(null)}
    >
      <div className="animate-bounce text-7xl">⚽</div>
      <div className="mt-2 text-5xl font-black tracking-widest text-oranje-400">GOAL!</div>
      <div className="mt-4 text-6xl">{goal.flag}</div>
      <div className="mt-2 text-2xl font-bold">{goal.team}</div>
      <div className="mt-3 text-4xl font-black tabular-nums">{goal.score}</div>
      <div className="mt-1 text-sm text-emerald-50/60">
        {goal.fixture} {goal.minute && `· ${goal.minute}`}
      </div>
    </div>
  );
}

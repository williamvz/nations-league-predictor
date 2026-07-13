import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { Spinner, LiveDot } from '../components/ui';
import GoalFlash from '../components/GoalFlash';
import { fmtDay, fmtTime, fmtPoints } from '../utils/format';
import { useT } from '../i18n';

/**
 * TV-modus: full-screen matchday dashboard for the living-room TV or a Home
 * Assistant dashboard card. Live scoreboards with goals, the family
 * leaderboard reshuffling live, and the upcoming schedule. Refreshes itself.
 */
export default function TV() {
  const { t, tn } = useT();
  const [data, setData] = useState(null);
  const [clock, setClock] = useState(new Date());

  async function load() {
    const [all, leaderboard] = await Promise.all([api.matches(), api.leaderboard()]);
    const matches = all.matches;
    const live = matches.filter((m) => m.status === 'live');
    // enrich live matches with their goal lists
    const detailed = await Promise.all(live.map((m) => api.match(m.id).then((d) => d.match).catch(() => m)));
    const upcoming = matches.filter((m) => m.status === 'scheduled').slice(0, 6);
    const recent = matches.filter((m) => m.status === 'finished').slice(-4).reverse();
    setData({ live: detailed, upcoming, recent, leaderboard });
  }

  useEffect(() => {
    load().catch(() => {});
    const t = setInterval(() => load().catch(() => {}), 15_000);
    const c = setInterval(() => setClock(new Date()), 1000);
    return () => {
      clearInterval(t);
      clearInterval(c);
    };
  }, []);

  if (!data) return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>;
  const { live, upcoming, recent, leaderboard } = data;
  const rows = leaderboard.leaderboard;

  return (
    <div className="pitch-bg min-h-screen p-6">
      <header className="mb-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <span className="text-3xl">🏆</span>
          <span className="text-2xl font-black">Nations League <span className="text-oranje-500">Pool</span></span>
        </Link>
        <div className="flex items-center gap-4">
          {live.length > 0 && <LiveDot />}
          <span className="text-2xl font-bold tabular-nums text-emerald-50/70">
            {clock.toLocaleTimeString('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* live + matches column (2/3) */}
        <div className="space-y-4 lg:col-span-2">
          {live.length === 0 && (
            <div className="card p-10 text-center text-emerald-50/50">
              <div className="mb-2 text-4xl">😴</div>
              {t('tv.noLive')}
            </div>
          )}
          {live.map((m) => (
            <div key={m.id} className="card border-red-500/30 p-6">
              <div className="mb-3 flex items-center justify-between text-sm text-emerald-50/50">
                <span>{m.stage === 'league' ? t('tv.group', { g: m.group_name }) : t('tv.knockout')} </span>
                <span className="flex items-center gap-2"><LiveDot /> <b className="text-red-400">{m.minute}</b></span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex flex-1 items-center justify-end gap-4 text-right">
                  <span className="text-3xl font-black">{tn(m.home_code, m.home_name)}</span>
                  <span className="text-6xl">{m.home_flag}</span>
                </div>
                <div className="mx-8 text-6xl font-black tabular-nums text-red-400">
                  {m.home_score}–{m.away_score}
                </div>
                <div className="flex flex-1 items-center gap-4">
                  <span className="text-6xl">{m.away_flag}</span>
                  <span className="text-3xl font-black">{tn(m.away_code, m.away_name)}</span>
                </div>
              </div>
              {m.goals?.length > 0 && (
                <div className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm text-emerald-50/60">
                  {m.goals.map((g, i) => (
                    <span key={i}>⚽ {g.minute} {g.player_name} <span className="text-emerald-50/40">({g.team_code})</span></span>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="card p-4">
              <h2 className="mb-2 font-bold text-emerald-50/60">{t('tv.upcoming')}</h2>
              {upcoming.length === 0 && <p className="text-sm text-emerald-50/40">{t('tv.noScheduled')}</p>}
              {upcoming.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-1.5 text-lg">
                  <span>{m.home_flag} <b>{m.home_code}</b> – <b>{m.away_code}</b> {m.away_flag}</span>
                  <span className="text-sm text-emerald-50/50">{fmtDay(m.kickoff_utc)} {fmtTime(m.kickoff_utc)}</span>
                </div>
              ))}
            </div>
            <div className="card p-4">
              <h2 className="mb-2 font-bold text-emerald-50/60">{t('tv.finished')}</h2>
              {recent.length === 0 && <p className="text-sm text-emerald-50/40">{t('tv.noResults')}</p>}
              {recent.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-1.5 text-lg">
                  <span>{m.home_flag} <b>{m.home_code}</b> – <b>{m.away_code}</b> {m.away_flag}</span>
                  <span className="font-black tabular-nums">{m.home_score}–{m.away_score}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* leaderboard column */}
        <div className="card self-start p-5">
          <h2 className="mb-3 flex items-center gap-2 text-xl font-black">
            🏆 {t('tv.board')} {leaderboard.is_live && <LiveDot />}
          </h2>
          <div className="space-y-2">
            {rows.slice(0, 12).map((r) => (
              <div key={r.user_id} className={`flex items-center gap-3 rounded-xl p-2 ${r.rank === 1 ? 'bg-oranje-500/15' : ''}`}>
                <span className="w-8 text-center text-xl font-black text-emerald-50/60">
                  {['🥇', '🥈', '🥉'][r.rank - 1] || r.rank}
                </span>
                <span className="text-2xl">{r.avatar}</span>
                <span className="flex-1 truncate text-lg font-semibold">{r.display_name}</span>
                {leaderboard.is_live && r.live_points > 0 && (
                  <span className="chip animate-pulse-live bg-red-500/15 text-red-300">+{fmtPoints(r.live_points)}</span>
                )}
                <span className="text-xl font-black tabular-nums">{fmtPoints(leaderboard.is_live ? r.live_total : r.total_points)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* faster goal detection on the big screen */}
      <GoalFlash intervalMs={12_000} />
    </div>
  );
}

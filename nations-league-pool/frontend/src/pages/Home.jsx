import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Spinner, StatCard, Countdown, LiveDot, Avatar } from '../components/ui';
import MatchCard from '../components/MatchCard';
import { fmtFull, fmtPoints } from '../utils/format';

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  async function load() {
    const [summary, upcoming, live, leaderboard] = await Promise.all([
      api.predictionSummary(),
      api.upcoming(),
      api.live(),
      api.leaderboard(),
    ]);
    setData({ summary, upcoming: upcoming.matches, live: live.matches, leaderboard });
  }

  useEffect(() => {
    load().catch(() => {});
    const t = setInterval(() => load().catch(() => {}), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!data) return <Spinner />;

  const { summary, upcoming, live, leaderboard } = data;
  const me = leaderboard.leaderboard.find((r) => r.user_id === user.id);
  const next = upcoming[0];
  const todo = upcoming.filter((m) => !m.prediction);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Avatar emoji={user.avatar} size="lg" />
        <div>
          <h1 className="text-2xl font-black">Hoi {user.display_name}! 👋</h1>
          <p className="text-sm text-emerald-50/50">
            {me ? <>Je staat <b className="text-oranje-300">#{me.rank}</b> met <b className="text-oranje-300">{fmtPoints(me.total_points)}</b> punten</> : 'Welkom bij de pool!'}
          </p>
        </div>
      </div>

      {/* live matches first */}
      {live.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 font-bold"><LiveDot /> Nu bezig</h2>
          {live.map((m) => (
            <MatchCard key={m.id} match={m} onSaved={load} onOpenDetail={(x) => navigate(`/wedstrijden/${x.id}`)} />
          ))}
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon="🎯" label="Punten" value={fmtPoints(summary.total_points)} sub={`waarvan ${fmtPoints(summary.bonus_points)} bonus`} />
        <StatCard icon="✅" label="Goed" value={summary.correct} sub={`${summary.exact} exact`} />
        <StatCard icon="📝" label="Ingevuld" value={summary.total} sub={`nog ${summary.still_open} open`} />
        <StatCard icon="🏅" label="Positie" value={me ? `#${me.rank}` : '–'} sub={leaderboard.is_live ? 'live!' : ''} />
      </div>

      {todo.length > 0 && (
        <div className="card border-oranje-500/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-oranje-300">⏳ Nog {todo.length} voorspelling{todo.length === 1 ? '' : 'en'} in te vullen</div>
              <div className="text-sm text-emerald-50/50">
                Eerstvolgende deadline: <Countdown iso={todo[0].kickoff_utc} />
              </div>
            </div>
            <Link to="/wedstrijden" className="btn-primary">Invullen</Link>
          </div>
        </div>
      )}

      {next && (
        <section className="space-y-3">
          <h2 className="font-bold">Volgende wedstrijd · <span className="font-normal text-emerald-50/50">{fmtFull(next.kickoff_utc)}</span></h2>
          <MatchCard match={next} onSaved={load} onOpenDetail={(m) => navigate(`/wedstrijden/${m.id}`)} />
        </section>
      )}

      {/* mini leaderboard */}
      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">🏆 Top 3 {leaderboard.is_live && <LiveDot />}</h2>
          <Link to="/ranglijst" className="text-sm text-oranje-400">Volledige ranglijst →</Link>
        </div>
        {leaderboard.prizes?.first && (
          <div className="mb-3 text-xs text-oranje-300">
            💰 Hoofdprijs: <b>{leaderboard.prizes.first}</b>
            {leaderboard.prizes.last && <> · 🏮 laatste plaats: {leaderboard.prizes.last}</>}
          </div>
        )}
        <div className="space-y-2">
          {leaderboard.leaderboard.slice(0, 3).map((r) => (
            <div key={r.user_id} className="flex items-center gap-3">
              <span className="w-6 text-center text-lg">{['🥇', '🥈', '🥉'][r.rank - 1] || `#${r.rank}`}</span>
              <Avatar emoji={r.avatar} size="sm" />
              <span className="flex-1 truncate font-semibold">{r.display_name}</span>
              {leaderboard.is_live && r.live_points > 0 && (
                <span className="chip bg-red-500/15 text-red-300">+{fmtPoints(r.live_points)}</span>
              )}
              <span className="font-bold tabular-nums">{fmtPoints(leaderboard.is_live ? r.live_total : r.total_points)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Spinner, StatCard } from '../components/ui';
import { fmtPoints } from '../utils/format';
import { useT } from '../i18n';

function Bar({ label, value, max, color = 'bg-oranje-500' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-28 shrink-0 text-emerald-50/60">{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/5">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right font-bold tabular-nums">{value}</span>
    </div>
  );
}

export default function KristallenBol() {
  const { t, tn } = useT();
  const { user } = useAuth();
  const [players, setPlayers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    api.leaderboard().then((d) => setPlayers(d.leaderboard)).catch(() => {});
  }, []);

  useEffect(() => {
    setData(null);
    api.stats(selected || undefined).then(setData).catch(() => {});
  }, [selected]);

  if (!data) return <Spinner />;
  const s = data.stats;
  const total = s.scored || 1;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-black">{t('bol.title')}</h1>
        <select className="input !w-auto" value={selected || user.id} onChange={(e) => setSelected(Number(e.target.value))}>
          {players.map((p) => (
            <option key={p.user_id} value={p.user_id}>{p.avatar} {p.display_name}</option>
          ))}
        </select>
      </div>

      {s.scored === 0 ? (
        <div className="card p-8 text-center text-emerald-50/50">
          <div className="mb-2 text-4xl">🔮</div>
          {t('bol.empty')}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon="🎯" label={t('bol.accuracy')} value={`${s.accuracy}%`} sub={t('bol.nPredictions', { n: s.scored })} />
            <StatCard icon="💥" label={t('bol.exact')} value={s.counts.exact} />
            <StatCard icon="🃏" label={t('bol.jokerBonus')} value={`+${fmtPoints(s.joker.extra_points)}`} sub={t('bol.jokerRatio', { h: s.joker.hits, u: s.joker.used })} />
            <StatCard icon="📊" label={t('bol.goals')} value={s.goals.predicted_avg} sub={t('bol.goalsReal', { n: s.goals.actual_avg })} />
          </div>

          <div className="card space-y-2 p-4">
            <h2 className="mb-1 font-bold">{t('bol.howGood')}</h2>
            <Bar label={t('bol.barExact')} value={s.counts.exact} max={total} />
            <Bar label={t('bol.barGd')} value={s.counts.gd} max={total} color="bg-emerald-500" />
            <Bar label={t('bol.barWinner')} value={s.counts.winner} max={total} color="bg-sky-500" />
            <Bar label={t('bol.barMiss')} value={s.counts.miss} max={total} color="bg-red-500/70" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {s.best_team && (
              <div className="card p-4">
                <h2 className="font-bold">{t('bol.click')}</h2>
                <div className="mt-2 text-3xl">{s.best_team.flag}</div>
                <div className="font-semibold">{tn(s.best_team.code, s.best_team.name)}</div>
                <div className="text-sm text-emerald-50/50">
                  {t('bol.clickSub', { n: s.best_team.avg.toFixed(1) })}
                </div>
              </div>
            )}
            {s.worst_team && (
              <div className="card p-4">
                <h2 className="font-bold">{t('bol.blind')}</h2>
                <div className="mt-2 text-3xl">{s.worst_team.flag}</div>
                <div className="font-semibold">{tn(s.worst_team.code, s.worst_team.name)}</div>
                <div className="text-sm text-emerald-50/50">
                  {t('bol.blindSub', { n: s.worst_team.avg.toFixed(1) })}
                </div>
              </div>
            )}
          </div>

          <div className="card space-y-3 p-4">
            <h2 className="font-bold">{t('bol.tend')}</h2>
            <p className="text-sm text-emerald-50/70">
              {t('bol.tendLine', { ph: s.tendency.pred_home_wins, ah: s.tendency.actual_home_wins, pd: s.tendency.pred_draws, ad: s.tendency.actual_draws })}{' '}
              {s.goals.predicted_avg > s.goals.actual_avg + 0.5 && t('bol.tendDream')}
              {s.goals.predicted_avg < s.goals.actual_avg - 0.5 && t('bol.tendStingy')}
            </p>
          </div>

          {(s.best_prediction || s.biggest_miss) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {s.best_prediction && (
                <div className="card p-4">
                  <h2 className="font-bold">{t('bol.golden')}</h2>
                  <p className="mt-1 text-sm">{s.best_prediction.fixture}</p>
                  <p className="text-sm text-emerald-50/50">
                    {t('bol.youSaid', { pred: s.best_prediction.predicted })} <b className="text-oranje-300">+{fmtPoints(s.best_prediction.points)}</b>
                  </p>
                </div>
              )}
              {s.biggest_miss && (
                <div className="card p-4">
                  <h2 className="font-bold">{t('bol.painful')}</h2>
                  <p className="mt-1 text-sm">{s.biggest_miss.fixture}</p>
                  <p className="text-sm text-emerald-50/50">
                    {t('bol.painfulSub', { pred: s.biggest_miss.predicted, n: s.biggest_miss.others_scored })}
                  </p>
                </div>
              )}
            </div>
          )}

          {s.rank_history.length > 0 && (
            <div className="card p-4">
              <h2 className="mb-2 font-bold">{t('bol.perRound')}</h2>
              <div className="flex items-end gap-2">
                {s.rank_history.map((h) => (
                  <div key={h.matchday} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-xs font-bold text-oranje-300">#{h.rank}</span>
                    <div className="w-full rounded-t bg-oranje-500/60" style={{ height: `${Math.max(8, h.matchday_points * 4)}px` }} />
                    <span className="text-[10px] text-emerald-50/40">R{h.matchday}</span>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-center text-[11px] text-emerald-50/40">{t('bol.barLegend')}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

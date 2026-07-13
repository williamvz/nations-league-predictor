import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Spinner, Avatar, LiveDot, Modal } from '../components/ui';
import { fmtPoints } from '../utils/format';
import { shareLeaderboardCard } from '../utils/shareCard';
import { useT } from '../i18n';

function MovementArrow({ rank, prevRank }) {
  if (prevRank == null || prevRank === rank) return <span className="w-4 text-emerald-50/20">·</span>;
  if (rank < prevRank) return <span className="w-4 text-emerald-400">▲</span>;
  return <span className="w-4 text-red-400">▼</span>;
}

export default function Leaderboard() {
  const { t } = useT();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [history, setHistory] = useState(null);
  const [compare, setCompare] = useState(null);

  async function load() {
    const d = await api.leaderboard();
    setData(d);
  }

  useEffect(() => {
    load().catch(() => {});
    api.leaderboardHistory().then((d) => setHistory(d.history)).catch(() => {});
    const t = setInterval(() => load().catch(() => {}), 45_000);
    return () => clearInterval(t);
  }, []);

  if (!data) return <Spinner />;
  const rows = data.leaderboard;

  async function share() {
    const lastMd = history?.length ? Math.max(...history.map((h) => h.matchday)) : null;
    await shareLeaderboardCard({
      rows,
      isLive: data.is_live,
      subtitle: data.is_live ? t('board.shareLive') : lastMd ? t('board.shareAfter', { md: lastMd }) : t('board.shareDefault'),
      footer: t('board.shareFooter'),
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">{t('board.title')}</h1>
        <div className="flex items-center gap-3">
          {data.is_live && (
            <span className="flex items-center gap-2 text-sm text-red-300">
              <LiveDot /> {t('board.live')}
            </span>
          )}
          <button className="btn-ghost !px-3 !py-1.5 text-sm" onClick={share} title="Deel als afbeelding">
            {t('board.share')}
          </button>
        </div>
      </div>

      <div className="card divide-y divide-white/5">
        {rows.map((r) => (
          <button
            key={r.user_id}
            className={`flex w-full items-center gap-3 p-3 text-left hover:bg-white/[0.03] ${r.user_id === user.id ? 'bg-oranje-500/5' : ''}`}
            onClick={() => r.user_id !== user.id && openCompare(r)}
          >
            <span className="w-8 text-center text-lg font-black text-emerald-50/60">
              {['🥇', '🥈', '🥉'][r.rank - 1] || r.rank}
            </span>
            <MovementArrow rank={r.rank} prevRank={r.prev_rank} />
            <Avatar emoji={r.avatar} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">
                {r.display_name} {r.favorite_flag && <span className="text-sm">{r.favorite_flag}</span>}
                {r.user_id === user.id && <span className="ml-1 text-xs text-oranje-400">{t('common.you')}</span>}
              </div>
              <div className="text-xs text-emerald-50/40">
                {t('board.stats', { exact: r.exact, correct: r.correct, filled: r.filled })}
              </div>
            </div>
            {data.is_live && r.live_points > 0 && (
              <span className="chip animate-pulse-live bg-red-500/15 text-red-300">+{fmtPoints(r.live_points)}</span>
            )}
            <span className="text-lg font-black tabular-nums">
              {fmtPoints(data.is_live ? r.live_total : r.total_points)}
            </span>
          </button>
        ))}
      </div>

      {history && history.length > 0 && <HistoryChart history={history} meId={user.id} />}

      <CompareModal compare={compare} onClose={() => setCompare(null)} />
    </div>
  );

  function openCompare(row) {
    api.compare(row.user_id).then((d) => setCompare(d)).catch(() => {});
  }
}

/** Hand-rolled SVG bump chart: rank per matchday for every player. */
function HistoryChart({ history, meId }) {
  const { t } = useT();
  const byUser = new Map();
  const matchdays = [...new Set(history.map((h) => h.matchday))].sort((a, b) => a - b);
  for (const h of history) {
    if (!byUser.has(h.user_id)) byUser.set(h.user_id, { name: h.display_name, avatar: h.avatar, points: new Map() });
    byUser.get(h.user_id).points.set(h.matchday, h.rank);
  }
  const users = [...byUser.entries()];
  const maxRank = Math.max(...history.map((h) => h.rank));
  const W = 640, H = Math.max(160, maxRank * 34), PAD = 36;
  const x = (md) => PAD + ((W - 2 * PAD) * matchdays.indexOf(md)) / Math.max(1, matchdays.length - 1);
  const y = (rank) => 20 + ((H - 40) * (rank - 1)) / Math.max(1, maxRank - 1);

  return (
    <div className="card p-4">
      <h2 className="mb-2 font-bold">{t('board.chart')}</h2>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[480px]">
          {matchdays.map((md) => (
            <g key={md}>
              <line x1={x(md)} y1={14} x2={x(md)} y2={H - 14} stroke="rgba(255,255,255,0.06)" />
              <text x={x(md)} y={H - 2} textAnchor="middle" fill="rgba(236,253,245,0.4)" fontSize="11">
                R{md}
              </text>
            </g>
          ))}
          {users.map(([uid, u]) => {
            const pts = matchdays.filter((md) => u.points.has(md)).map((md) => `${x(md)},${y(u.points.get(md))}`);
            const isMe = uid === meId;
            return (
              <g key={uid}>
                <polyline
                  points={pts.join(' ')}
                  fill="none"
                  stroke={isMe ? '#ff7a00' : 'rgba(236,253,245,0.25)'}
                  strokeWidth={isMe ? 3 : 1.5}
                  strokeLinecap="round"
                />
                {matchdays.filter((md) => u.points.has(md)).map((md) => (
                  <circle key={md} cx={x(md)} cy={y(u.points.get(md))} r={isMe ? 4 : 2.5}
                    fill={isMe ? '#ff7a00' : 'rgba(236,253,245,0.35)'} />
                ))}
                {u.points.has(matchdays[matchdays.length - 1]) && (
                  <text
                    x={x(matchdays[matchdays.length - 1]) + 8}
                    y={y(u.points.get(matchdays[matchdays.length - 1])) + 4}
                    fill={isMe ? '#ffb267' : 'rgba(236,253,245,0.5)'}
                    fontSize="11"
                  >
                    {u.avatar} {u.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function CompareModal({ compare, onClose }) {
  const { t } = useT();
  if (!compare) return null;
  const { other, matches } = compare;
  const myTotal = matches.reduce((s, m) => s + (m.my_points || 0), 0);
  const theirTotal = matches.reduce((s, m) => s + (m.their_points || 0), 0);
  return (
    <Modal open onClose={onClose} title={`${t('board.vs', { name: other.display_name })} ${other.avatar}`} wide>
      <div className="mb-3 flex justify-around text-center">
        <div>
          <div className="text-2xl font-black text-oranje-400">{fmtPoints(myTotal)}</div>
          <div className="text-xs text-emerald-50/50">{t('board.me')}</div>
        </div>
        <div>
          <div className="text-2xl font-black">{fmtPoints(theirTotal)}</div>
          <div className="text-xs text-emerald-50/50">{other.display_name}</div>
        </div>
      </div>
      <div className="max-h-[50vh] space-y-1 overflow-y-auto">
        {matches.map((m) => (
          <div key={m.match_id} className="flex items-center gap-2 rounded-lg bg-white/[0.03] p-2 text-sm">
            <span className="flex-1 truncate">
              {m.home_flag} {m.home_name} – {m.away_name} {m.away_flag}
              {m.home_score != null && <b className="ml-1">({m.home_score}–{m.away_score})</b>}
            </span>
            <span className="w-14 text-center tabular-nums">
              {m.my_home != null ? `${m.my_home}–${m.my_away}` : '·'}
              {m.my_joker === 1 && '🃏'}
            </span>
            <span className="w-8 text-center font-semibold text-oranje-300">{m.my_points != null ? fmtPoints(m.my_points) : ''}</span>
            <span className="w-14 text-center tabular-nums">
              {m.their_home != null ? `${m.their_home}–${m.their_away}` : '·'}
              {m.their_joker === 1 && '🃏'}
            </span>
            <span className="w-8 text-center font-semibold">{m.their_points != null ? fmtPoints(m.their_points) : ''}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

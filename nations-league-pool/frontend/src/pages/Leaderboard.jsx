import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Spinner, Avatar, LiveDot, Modal } from '../components/ui';
import { fmtPoints } from '../utils/format';

function MovementArrow({ rank, prevRank }) {
  if (prevRank == null || prevRank === rank) return <span className="w-4 text-emerald-50/20">·</span>;
  if (rank < prevRank) return <span className="w-4 text-emerald-400">▲</span>;
  return <span className="w-4 text-red-400">▼</span>;
}

export default function Leaderboard() {
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
  const prizes = data.prizes || {};
  const hasPrizes = prizes.first || prizes.second || prizes.third || prizes.last;
  // a prize chip is only meaningful on a rank held by exactly one player —
  // with ties (like everyone on 0 points before matchday 1) the banner above
  // says what's at stake and the rows stay clean
  const rankCounts = rows.reduce((acc, r) => acc.set(r.rank, (acc.get(r.rank) || 0) + 1), new Map());
  const seasonStarted = rows.some((r) => r.total_points > 0 || r.live_points > 0);
  const prizeForRank = (rank) => {
    if (!seasonStarted || rankCounts.get(rank) !== 1) return null;
    if (rank === 1) return prizes.first;
    if (rank === 2) return prizes.second;
    if (rank === 3) return prizes.third;
    return null;
  };
  const lastRow = rows[rows.length - 1];
  const lastRank = seasonStarted && rows.length > 3 && rankCounts.get(lastRow.rank) === 1 ? lastRow.rank : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">Ranglijst</h1>
        {data.is_live && (
          <span className="flex items-center gap-2 text-sm text-red-300">
            <LiveDot /> incl. live-punten
          </span>
        )}
      </div>

      {hasPrizes && (
        <div className="card border-oranje-500/30 bg-gradient-to-r from-oranje-500/10 to-transparent p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-bold text-oranje-300">💰 Er valt wat te winnen!</h2>
            {prizes.entry_fee && <span className="chip bg-white/5 text-emerald-50/60">inleg: {prizes.entry_fee}</span>}
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            {prizes.first && <span className="chip bg-yellow-500/15 text-yellow-300">🥇 {prizes.first}</span>}
            {prizes.second && <span className="chip bg-slate-400/15 text-slate-300">🥈 {prizes.second}</span>}
            {prizes.third && <span className="chip bg-amber-700/20 text-amber-500">🥉 {prizes.third}</span>}
            {prizes.last && <span className="chip bg-red-500/10 text-red-300">🏮 Rode lantaarn: {prizes.last}</span>}
          </div>
        </div>
      )}

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
                {r.user_id === user.id && <span className="ml-1 text-xs text-oranje-400">(jij)</span>}
              </div>
              <div className="truncate text-xs text-emerald-50/40">
                {r.exact}× exact · {r.correct}× goed · {r.filled} ingevuld
              </div>
              {prizeForRank(r.rank) && (
                <div className="mt-0.5 text-xs font-semibold text-oranje-300">💰 {prizeForRank(r.rank)}</div>
              )}
              {prizes.last && lastRank && r.rank === lastRank && !prizeForRank(r.rank) && (
                <div className="mt-0.5 text-xs font-semibold text-red-300">🏮 {prizes.last}</div>
              )}
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
      <h2 className="mb-2 font-bold">📈 Verloop per speelronde</h2>
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
  if (!compare) return null;
  const { other, matches } = compare;
  const myTotal = matches.reduce((s, m) => s + (m.my_points || 0), 0);
  const theirTotal = matches.reduce((s, m) => s + (m.their_points || 0), 0);
  return (
    <Modal open onClose={onClose} title={`Jij vs ${other.display_name} ${other.avatar}`} wide>
      <div className="mb-3 flex justify-around text-center">
        <div>
          <div className="text-2xl font-black text-oranje-400">{fmtPoints(myTotal)}</div>
          <div className="text-xs text-emerald-50/50">jij</div>
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

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/api';
import { Spinner, Modal, LiveDot } from '../components/ui';
import MatchCard from '../components/MatchCard';
import { groupBy, fmtFull, fmtPoints, roundLabel, matchContext } from '../utils/format';

const FILTERS = [
  { key: 'alle', label: 'Alle' },
  { key: 'open', label: 'Nog invullen' },
  { key: 'ingevuld', label: 'Ingevuld' },
  { key: 'afgelopen', label: 'Afgelopen' },
];

export default function Matches() {
  const [matches, setMatches] = useState(null);
  const [filter, setFilter] = useState('alle');
  const navigate = useNavigate();
  const { id } = useParams();

  async function load() {
    const d = await api.matches();
    setMatches(d.matches);
  }

  useEffect(() => {
    load().catch(() => {});
    const t = setInterval(() => load().catch(() => {}), 60_000);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    if (!matches) return [];
    switch (filter) {
      case 'open':
        return matches.filter((m) => !m.is_locked && !m.prediction);
      case 'ingevuld':
        return matches.filter((m) => !m.is_locked && m.prediction);
      case 'afgelopen':
        return matches.filter((m) => m.status === 'finished');
      default:
        return matches;
    }
  }, [matches, filter]);

  if (!matches) return <Spinner />;

  const counts = {
    alle: matches.length,
    open: matches.filter((m) => !m.is_locked && !m.prediction).length,
    ingevuld: matches.filter((m) => !m.is_locked && m.prediction).length,
    afgelopen: matches.filter((m) => m.status === 'finished').length,
  };
  const byRound = groupBy(filtered, roundLabel);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black">Wedstrijden</h1>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`chip whitespace-nowrap ${filter === f.key ? 'bg-oranje-500 text-pitch-950' : 'bg-white/5 text-emerald-50/60'}`}
          >
            {f.label} ({counts[f.key]})
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="py-10 text-center text-emerald-50/40">Geen wedstrijden in deze categorie 🎉</p>
      )}

      {[...byRound.entries()].map(([label, list]) => (
        <section key={label} className="space-y-3">
          <h2 className="sticky top-14 z-10 -mx-1 bg-pitch-950/90 px-1 py-1 font-bold text-emerald-50/70 backdrop-blur">
            {label}
          </h2>
          {list.map((m) => (
            <MatchCard key={m.id} match={m} onSaved={load} onOpenDetail={(x) => navigate(`/wedstrijden/${x.id}`)} />
          ))}
        </section>
      ))}

      <MatchDetail id={id} onClose={() => navigate('/wedstrijden')} />
    </div>
  );
}

function MatchDetail({ id, onClose }) {
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (!id) {
      setDetail(null);
      return;
    }
    let stop = false;
    api.match(id).then((d) => !stop && setDetail(d.match)).catch(() => {});
    return () => {
      stop = true;
    };
  }, [id]);

  if (!id) return null;
  const m = detail;

  return (
    <Modal open={!!id} onClose={onClose} title={m ? `${m.home_flag} ${m.home_name} – ${m.away_name} ${m.away_flag}` : 'Laden…'} wide>
      {!m ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <div className="text-center">
            {m.status !== 'scheduled' ? (
              <div className="text-4xl font-black tabular-nums">
                {m.home_score}–{m.away_score}
                {m.status === 'live' && <div className="mt-1 flex justify-center"><LiveDot /></div>}
              </div>
            ) : (
              <div className="text-emerald-50/60">{fmtFull(m.kickoff_utc)}</div>
            )}
            <div className="mt-1 text-xs text-emerald-50/40">{matchContext(m)}</div>
          </div>

          {m.goals?.length > 0 && (
            <div className="card p-3">
              <h3 className="mb-2 text-sm font-bold text-emerald-50/60">⚽ Doelpunten</h3>
              {m.goals.map((g, i) => (
                <div key={i} className="flex items-center gap-2 py-0.5 text-sm">
                  <span className="w-10 text-emerald-50/40">{g.minute || ''}</span>
                  <span>{g.player_name}</span>
                  {g.event_type === 'own_goal' && <span className="text-xs text-red-400">(e.d.)</span>}
                  {g.event_type === 'penalty' && <span className="text-xs text-emerald-50/40">(pen.)</span>}
                  <span className="ml-auto text-xs text-emerald-50/40">{g.team_code}</span>
                </div>
              ))}
            </div>
          )}

          {m.all_predictions && (
            <div className="card p-3">
              <h3 className="mb-2 text-sm font-bold text-emerald-50/60">👥 Alle voorspellingen</h3>
              {m.all_predictions.length === 0 && <p className="text-sm text-emerald-50/40">Niemand heeft voorspeld.</p>}
              {m.all_predictions.map((p, i) => (
                <div key={i} className="flex items-center gap-2 py-1 text-sm">
                  <span>{p.avatar}</span>
                  <span className="flex-1 truncate">{p.display_name}</span>
                  {p.is_joker === 1 && <span>🃏</span>}
                  <span className="font-semibold tabular-nums">{p.home_goals}–{p.away_goals}</span>
                  {p.points != null && (
                    <span className={`chip ${p.points > 0 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-emerald-50/40'}`}>
                      +{fmtPoints(p.points)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

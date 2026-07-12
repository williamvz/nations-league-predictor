import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Spinner, Modal, LiveDot } from '../components/ui';
import { fmtDay, fmtTime } from '../utils/format';

function FormBadge({ letter }) {
  const live = letter.endsWith('*');
  const l = letter[0];
  const cls = l === 'W' ? 'bg-emerald-500/20 text-emerald-300' : l === 'G' ? 'bg-white/10 text-emerald-50/60' : 'bg-red-500/20 text-red-300';
  return <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${cls} ${live ? 'animate-pulse-live' : ''}`}>{l}</span>;
}

export default function Standings() {
  const [groups, setGroups] = useState(null);
  const [scorers, setScorers] = useState(null);
  const [team, setTeam] = useState(null);

  async function load() {
    const [s, sc] = await Promise.all([api.standings(), api.scorers()]);
    setGroups(s.groups);
    setScorers(sc.scorers);
  }

  useEffect(() => {
    load().catch(() => {});
    const t = setInterval(() => load().catch(() => {}), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!groups) return <Spinner />;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black">Stand · League A</h1>

      <div className="grid gap-4 lg:grid-cols-2">
        {Object.entries(groups).map(([name, rows]) => (
          <div key={name} className="card overflow-hidden">
            <div className="flex items-center justify-between bg-white/[0.03] px-4 py-2">
              <h2 className="font-bold">Groep {name}</h2>
              {rows.some((r) => r.form.some((f) => f.endsWith('*'))) && <LiveDot />}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-emerald-50/40">
                  <th className="py-1 pl-4 font-normal">#</th>
                  <th className="font-normal">Land</th>
                  <th className="text-center font-normal">G</th>
                  <th className="hidden text-center font-normal sm:table-cell">W</th>
                  <th className="hidden text-center font-normal sm:table-cell">G</th>
                  <th className="hidden text-center font-normal sm:table-cell">V</th>
                  <th className="text-center font-normal">+/−</th>
                  <th className="pr-2 text-center font-bold">P</th>
                  <th className="pr-4 text-right font-normal">Vorm</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.team_id}
                    className={`cursor-pointer border-t border-white/5 hover:bg-white/[0.03] ${r.position === 1 ? 'bg-oranje-500/5' : ''}`}
                    onClick={() => api.teamInsights(r.team_id).then(setTeam).catch(() => {})}
                  >
                    <td className="py-2 pl-4 text-emerald-50/50">{r.position}</td>
                    <td className="font-semibold">
                      <span className="mr-1.5">{r.flag}</span>
                      {r.name_nl}
                      {r.position === 1 && <span className="ml-1 text-xs">🏆</span>}
                      {r.position === 4 && <span className="ml-1 text-xs text-red-400">▼</span>}
                    </td>
                    <td className="text-center tabular-nums">{r.played}</td>
                    <td className="hidden text-center tabular-nums text-emerald-50/60 sm:table-cell">{r.won}</td>
                    <td className="hidden text-center tabular-nums text-emerald-50/60 sm:table-cell">{r.drawn}</td>
                    <td className="hidden text-center tabular-nums text-emerald-50/60 sm:table-cell">{r.lost}</td>
                    <td className="text-center tabular-nums text-emerald-50/60">{r.goal_diff > 0 ? '+' : ''}{r.goal_diff}</td>
                    <td className="pr-2 text-center font-black tabular-nums">{r.points}</td>
                    <td className="pr-4 text-right">
                      <span className="inline-flex gap-0.5">{r.form.slice(-5).map((f, i) => <FormBadge key={i} letter={f} />)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 text-[11px] text-emerald-50/30">
              🏆 groepswinnaar → kwartfinales · ▼ nummer 4 degradeert naar League B
            </div>
          </div>
        ))}
      </div>

      {/* top scorers */}
      <div className="card p-4">
        <h2 className="mb-3 font-bold">👟 Topscorers</h2>
        {(!scorers || scorers.length === 0) && (
          <p className="text-sm text-emerald-50/40">Nog geen doelpunten — de topscorerslijst vult zichzelf automatisch zodra er gespeeld wordt.</p>
        )}
        <div className="space-y-1">
          {scorers?.slice(0, 15).map((s, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg p-2 hover:bg-white/[0.03]">
              <span className="w-6 text-center font-bold text-emerald-50/50">{i + 1}</span>
              <span className="text-lg">{s.team_flag || '⚽'}</span>
              <span className="flex-1 font-semibold">{s.player_name}</span>
              <span className="text-xs text-emerald-50/40">{s.team_name || ''}</span>
              <span className="chip bg-oranje-500/15 font-black text-oranje-300">{s.goals}</span>
            </div>
          ))}
        </div>
      </div>

      <TeamModal team={team} onClose={() => setTeam(null)} />
    </div>
  );
}

function TeamModal({ team, onClose }) {
  if (!team) return null;
  const t = team.team;
  return (
    <Modal open onClose={onClose} title={`${t.flag} ${t.name_nl}`}>
      <div className="space-y-4">
        {team.standing && (
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="card p-2"><div className="text-lg font-black">#{team.standing.position}</div><div className="text-[10px] text-emerald-50/40">in groep {t.group_name}</div></div>
            <div className="card p-2"><div className="text-lg font-black">{team.standing.points}</div><div className="text-[10px] text-emerald-50/40">punten</div></div>
            <div className="card p-2"><div className="text-lg font-black">{team.standing.goals_for}</div><div className="text-[10px] text-emerald-50/40">goals voor</div></div>
            <div className="card p-2"><div className="text-lg font-black">{team.standing.goals_against}</div><div className="text-[10px] text-emerald-50/40">goals tegen</div></div>
          </div>
        )}

        {team.next && (
          <div>
            <h3 className="mb-1 text-sm font-bold text-emerald-50/60">Volgende wedstrijd</h3>
            <div className="card p-3 text-sm">
              {team.next.home_flag} {team.next.home_name} – {team.next.away_name} {team.next.away_flag}
              <div className="text-xs text-emerald-50/40">{fmtDay(team.next.kickoff_utc)} · {fmtTime(team.next.kickoff_utc)}</div>
            </div>
          </div>
        )}

        {team.recent.length > 0 && (
          <div>
            <h3 className="mb-1 text-sm font-bold text-emerald-50/60">Laatste wedstrijden</h3>
            <div className="space-y-1">
              {team.recent.map((m) => (
                <div key={m.id} className="flex justify-between rounded-lg bg-white/[0.03] p-2 text-sm">
                  <span>{m.home_flag} {m.home_name} – {m.away_name} {m.away_flag}</span>
                  <b className="tabular-nums">{m.home_score}–{m.away_score}</b>
                </div>
              ))}
            </div>
          </div>
        )}

        {team.top_scorers.length > 0 && (
          <div>
            <h3 className="mb-1 text-sm font-bold text-emerald-50/60">Doelpuntenmakers</h3>
            {team.top_scorers.map((s, i) => (
              <div key={i} className="flex justify-between p-1 text-sm">
                <span>{s.player_name}</span><b>{s.goals}</b>
              </div>
            ))}
          </div>
        )}

        {team.picked_as_group_winner_by.length > 0 && (
          <div>
            <h3 className="mb-1 text-sm font-bold text-emerald-50/60">Als groepswinnaar getipt door</h3>
            <div className="flex flex-wrap gap-1">
              {team.picked_as_group_winner_by.map((u, i) => (
                <span key={i} className="chip bg-white/5">{u.avatar} {u.display_name}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

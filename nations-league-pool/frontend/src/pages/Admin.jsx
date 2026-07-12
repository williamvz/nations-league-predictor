import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Spinner, ErrorNote, Modal } from '../components/ui';
import { fmtDay, fmtTime } from '../utils/format';

const TABS = [
  { key: 'status', label: '📡 Status' },
  { key: 'users', label: '👥 Gebruikers' },
  { key: 'matches', label: '⚽ Uitslagen' },
  { key: 'settings', label: '⚙️ Instellingen' },
];

export default function Admin() {
  const [tab, setTab] = useState('status');
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black">Beheer 🛠️</h1>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`chip whitespace-nowrap ${tab === t.key ? 'bg-oranje-500 text-pitch-950' : 'bg-white/5 text-emerald-50/60'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'status' && <StatusTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'matches' && <MatchesTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}

function StatusTab() {
  const [dash, setDash] = useState(null);
  const [log, setLog] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [d, l] = await Promise.all([api.admin.dashboard(), api.admin.syncLog()]);
    setDash(d);
    setLog(l.log);
  }
  useEffect(() => {
    load().catch(() => {});
  }, []);

  if (!dash) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3 text-center"><div className="text-xl font-black">{dash.users}</div><div className="text-xs text-emerald-50/40">spelers</div></div>
        <div className="card p-3 text-center"><div className="text-xl font-black">{dash.finished}/{dash.matches}</div><div className="text-xs text-emerald-50/40">gespeeld</div></div>
        <div className="card p-3 text-center"><div className="text-xl font-black">{dash.predictions}</div><div className="text-xs text-emerald-50/40">voorspellingen</div></div>
      </div>

      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold">Automatische sync</h2>
          <button
            className="btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try { await api.admin.runSync(); await load(); } finally { setBusy(false); }
            }}
          >
            {busy ? 'Bezig…' : '▶ Nu synchroniseren'}
          </button>
        </div>
        <p className="mb-3 text-xs text-emerald-50/40">
          Live: elke 2 min tijdens wedstrijden · sweep: elke 20 min · speelschema: dagelijks 05:30
        </p>
        <div className="max-h-72 space-y-1 overflow-y-auto font-mono text-xs">
          {log?.length === 0 && <p className="text-emerald-50/40">Nog geen sync-activiteit.</p>}
          {log?.map((l) => (
            <div key={l.id} className={`rounded p-1.5 ${l.ok ? 'bg-white/[0.03]' : 'bg-red-500/10 text-red-300'}`}>
              <span className="text-emerald-50/40">{l.ts}</span> <b>{l.job}</b>
              {l.provider && <span className="text-emerald-50/50"> [{l.provider}]</span>} — {l.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ username: '', display_name: '', password: '' });

  async function load() {
    const d = await api.admin.users();
    setUsers(d.users);
  }
  useEffect(() => {
    load().catch(() => {});
  }, []);

  if (!users) return <Spinner />;

  async function run(fn) {
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const pending = users.filter((u) => u.status === 'pending');
  const active = users.filter((u) => u.status !== 'pending');

  return (
    <div className="space-y-4">
      <ErrorNote error={error} />

      {pending.length > 0 && (
        <div className="card space-y-2 border-oranje-500/40 p-4">
          <h2 className="font-bold text-oranje-300">⏳ Wacht op goedkeuring ({pending.length})</h2>
          {pending.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white/[0.03] p-3">
              <span className="text-xl">{u.avatar}</span>
              <div className="min-w-[10rem] flex-1">
                <div className="font-semibold">{u.display_name} <span className="text-xs text-emerald-50/40">@{u.username}</span></div>
                <div className="text-xs text-emerald-50/40">aangemeld op {u.created_at?.slice(0, 10)}</div>
              </div>
              <button
                className="btn bg-emerald-500 text-pitch-950 hover:bg-emerald-400"
                onClick={() => run(() => api.admin.approveUser(u.id))}
              >
                ✓ Goedkeuren
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  if (window.confirm(`Aanmelding van ${u.display_name} afwijzen?`)) {
                    run(() => api.admin.rejectUser(u.id));
                  }
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="card space-y-2 p-4">
        <h2 className="font-bold">Nieuwe speler</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className="input" placeholder="gebruikersnaam" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <input className="input" placeholder="weergavenaam" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          <input className="input" placeholder="tijdelijk wachtwoord" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <button
          className="btn-primary"
          onClick={() => run(async () => {
            await api.admin.createUser(form);
            setForm({ username: '', display_name: '', password: '' });
          })}
          disabled={form.username.length < 3 || form.password.length < 6}
        >
          + Toevoegen
        </button>
      </div>

      <div className="card divide-y divide-white/5">
        {active.map((u) => (
          <div key={u.id} className="flex items-center gap-3 p-3">
            <span className="text-xl">{u.avatar}</span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">
                {u.display_name} <span className="text-xs text-emerald-50/40">@{u.username}</span>
                {u.is_admin === 1 && <span className="ml-1 chip bg-oranje-500/15 text-oranje-300">admin</span>}
              </div>
              <div className="text-xs text-emerald-50/40">{u.prediction_count} voorspellingen</div>
            </div>
            <button
              className="btn-ghost !px-2 !py-1 text-xs"
              onClick={() => {
                const pw = window.prompt(`Nieuw tijdelijk wachtwoord voor ${u.username}:`);
                if (pw) run(() => api.admin.updateUser(u.id, { password: pw }));
              }}
            >
              🔑
            </button>
            <button
              className="btn-ghost !px-2 !py-1 text-xs"
              onClick={() => {
                if (window.confirm(`${u.display_name} definitief verwijderen (incl. voorspellingen)?`)) {
                  run(() => api.admin.deleteUser(u.id));
                }
              }}
            >
              🗑️
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchesTab() {
  const [matches, setMatches] = useState(null);
  const [edit, setEdit] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    const d = await api.matches();
    setMatches(d.matches);
  }
  useEffect(() => {
    load().catch(() => {});
  }, []);

  if (!matches) return <Spinner />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-emerald-50/50">
        Uitslagen komen automatisch binnen. Handmatig invoeren is alleen nodig als de sync faalt — een handmatige uitslag wordt nooit overschreven.
      </p>
      <ErrorNote error={error} />
      <div className="card divide-y divide-white/5">
        {matches.map((m) => (
          <div key={m.id} className="flex items-center gap-2 p-3 text-sm">
            <span className="w-24 text-xs text-emerald-50/40">{fmtDay(m.kickoff_utc)} {fmtTime(m.kickoff_utc)}</span>
            <span className="flex-1 truncate">
              {m.home_flag} {m.home_name} – {m.away_name} {m.away_flag}
            </span>
            {m.status === 'finished' ? (
              <span className="font-bold tabular-nums">{m.home_score}–{m.away_score}</span>
            ) : (
              <span className="text-xs text-emerald-50/30">{m.status}</span>
            )}
            {m.result_source && <span className="chip bg-white/5 text-[10px]">{m.result_source}</span>}
            <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setEdit(m)}>✏️</button>
          </div>
        ))}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit ? `${edit.home_name} – ${edit.away_name}` : ''}>
        {edit && (
          <EditResult
            match={edit}
            onDone={async () => {
              setEdit(null);
              await load();
            }}
            onError={setError}
          />
        )}
      </Modal>
    </div>
  );
}

function EditResult({ match, onDone, onError }) {
  const [home, setHome] = useState(match.home_score ?? 0);
  const [away, setAway] = useState(match.away_score ?? 0);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-4">
        <input type="number" min={0} max={20} className="input w-20 text-center text-xl" value={home} onChange={(e) => setHome(Number(e.target.value))} />
        <span className="font-bold">–</span>
        <input type="number" min={0} max={20} className="input w-20 text-center text-xl" value={away} onChange={(e) => setAway(Number(e.target.value))} />
      </div>
      <button
        className="btn-primary w-full"
        onClick={async () => {
          try {
            await api.admin.setResult(match.id, home, away);
            onDone();
          } catch (err) {
            onError(err.message);
          }
        }}
      >
        Uitslag opslaan & punten berekenen
      </button>
      {match.status === 'finished' && (
        <button
          className="btn-ghost w-full"
          onClick={async () => {
            try {
              await api.admin.resetMatch(match.id);
              onDone();
            } catch (err) {
              onError(err.message);
            }
          }}
        >
          ↩︎ Uitslag wissen (terug naar gepland)
        </button>
      )}
    </div>
  );
}

function SettingsTab() {
  const [dash, setDash] = useState(null);
  const [invite, setInvite] = useState('');
  const [prizes, setPrizes] = useState({ first: '', second: '', third: '', last: '', entry_fee: '' });
  const [msgTitle, setMsgTitle] = useState('');
  const [msgBody, setMsgBody] = useState('');
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    api.admin.dashboard().then((d) => {
      setDash(d);
      setInvite(d.invite_code || '');
      if (d.prizes) setPrizes(d.prizes);
    }).catch(() => {});
  }, []);

  if (!dash) return <Spinner />;

  async function flash(fn) {
    await fn();
    setSaved('Opgeslagen ✓');
    setTimeout(() => setSaved(null), 2000);
  }

  return (
    <div className="space-y-4">
      {saved && <div className="text-sm text-emerald-300">{saved}</div>}

      <div className="card space-y-2 p-4">
        <h2 className="font-bold">Automatische sync</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-oranje-500"
            checked={dash.sync_enabled}
            onChange={(e) => flash(async () => {
              await api.admin.settings({ sync_enabled: e.target.checked });
              setDash({ ...dash, sync_enabled: e.target.checked });
            })}
          />
          Uitslagen automatisch ophalen (ESPN + TheSportsDB)
        </label>
      </div>

      <div className="card space-y-2 p-4">
        <h2 className="font-bold">Uitnodigingscode</h2>
        <p className="text-xs text-emerald-50/40">Met deze code kunnen vrienden zelf een account aanmaken. Leeg = registratie gesloten.</p>
        <div className="flex gap-2">
          <input className="input" value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="bijv. oranjeboven" />
          <button className="btn-primary" onClick={() => flash(() => api.admin.settings({ invite_code: invite }))}>Opslaan</button>
        </div>
      </div>

      <div className="card space-y-2 p-4">
        <h2 className="font-bold">Prijzenpot 💰</h2>
        <p className="text-xs text-emerald-50/40">
          Vul in wat er te winnen valt — spelers zien dit op de ranglijst. Vrije tekst: "€ 50", "Kratje bier", "Wisselbeker"…
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-emerald-50/60">🥇 Eerste prijs</span>
            <input className="input" value={prizes.first} onChange={(e) => setPrizes({ ...prizes, first: e.target.value })} placeholder="bijv. € 50" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-emerald-50/60">🥈 Tweede prijs</span>
            <input className="input" value={prizes.second} onChange={(e) => setPrizes({ ...prizes, second: e.target.value })} placeholder="bijv. € 25" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-emerald-50/60">🥉 Derde prijs</span>
            <input className="input" value={prizes.third} onChange={(e) => setPrizes({ ...prizes, third: e.target.value })} placeholder="bijv. € 10" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-emerald-50/60">🏮 Rode lantaarn (laatste plaats)</span>
            <input className="input" value={prizes.last} onChange={(e) => setPrizes({ ...prizes, last: e.target.value })} placeholder="bijv. rondje appeltaart" />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-emerald-50/60">Inleg per speler (optioneel)</span>
            <input className="input" value={prizes.entry_fee} onChange={(e) => setPrizes({ ...prizes, entry_fee: e.target.value })} placeholder="bijv. € 5" />
          </label>
        </div>
        <button
          className="btn-primary"
          onClick={() => flash(() => api.admin.settings({
            prize_first: prizes.first, prize_second: prizes.second, prize_third: prizes.third,
            prize_last: prizes.last, entry_fee: prizes.entry_fee,
          }))}
        >
          Prijzen opslaan
        </button>
      </div>

      <div className="card space-y-2 p-4">
        <h2 className="font-bold">Bericht aan iedereen 📣</h2>
        <input className="input" placeholder="Titel" value={msgTitle} onChange={(e) => setMsgTitle(e.target.value)} />
        <textarea className="input" rows={2} placeholder="Bericht (optioneel)" value={msgBody} onChange={(e) => setMsgBody(e.target.value)} />
        <button
          className="btn-primary"
          disabled={!msgTitle.trim()}
          onClick={() => flash(async () => {
            await api.admin.broadcast({ title: msgTitle, body: msgBody });
            setMsgTitle('');
            setMsgBody('');
          })}
        >
          Versturen
        </button>
      </div>
    </div>
  );
}

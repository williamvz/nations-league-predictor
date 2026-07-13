import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Spinner, ErrorNote, Modal } from '../components/ui';
import { fmtDay, fmtTime } from '../utils/format';
import { useT } from '../i18n';

const TABS = [
  { key: 'status', label: 'admin.tabStatus' },
  { key: 'users', label: 'admin.tabUsers' },
  { key: 'matches', label: 'admin.tabMatches' },
  { key: 'settings', label: 'admin.tabSettings' },
];

export default function Admin() {
  const { t } = useT();
  const [tab, setTab] = useState('status');
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black">{t('admin.title')}</h1>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`chip whitespace-nowrap ${tab === tb.key ? 'bg-oranje-500 text-pitch-950' : 'bg-white/5 text-emerald-50/60'}`}
          >
            {t(tb.label)}
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
  const { t } = useT();
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
        <div className="card p-3 text-center"><div className="text-xl font-black">{dash.users}</div><div className="text-xs text-emerald-50/40">{t('admin.players')}</div></div>
        <div className="card p-3 text-center"><div className="text-xl font-black">{dash.finished}/{dash.matches}</div><div className="text-xs text-emerald-50/40">{t('admin.played')}</div></div>
        <div className="card p-3 text-center"><div className="text-xl font-black">{dash.predictions}</div><div className="text-xs text-emerald-50/40">{t('admin.predictions')}</div></div>
      </div>

      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold">{t('admin.sync')}</h2>
          <button
            className="btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try { await api.admin.runSync(); await load(); } finally { setBusy(false); }
            }}
          >
            {busy ? t('admin.syncBusy') : t('admin.syncNow')}
          </button>
        </div>
        <p className="mb-3 text-xs text-emerald-50/40">
          {t('admin.syncSchedule')}
        </p>
        <div className="max-h-72 space-y-1 overflow-y-auto font-mono text-xs">
          {log?.length === 0 && <p className="text-emerald-50/40">{t('admin.noSync')}</p>}
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
  const { t } = useT();
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
          <h2 className="font-bold text-oranje-300">{t('admin.pending', { n: pending.length })}</h2>
          {pending.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white/[0.03] p-3">
              <span className="text-xl">{u.avatar}</span>
              <div className="min-w-[10rem] flex-1">
                <div className="font-semibold">{u.display_name} <span className="text-xs text-emerald-50/40">@{u.username}</span></div>
                <div className="text-xs text-emerald-50/40">{t('admin.registered', { date: u.created_at?.slice(0, 10) })}</div>
              </div>
              <button
                className="btn bg-emerald-500 text-pitch-950 hover:bg-emerald-400"
                onClick={() => run(() => api.admin.approveUser(u.id))}
              >
                {t('notif.approve')}
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  if (window.confirm(t('admin.rejectConfirm', { name: u.display_name }))) {
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
        <h2 className="font-bold">{t('admin.newPlayer')}</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className="input" placeholder={t('admin.phUsername')} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <input className="input" placeholder={t('admin.phDisplay')} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          <input className="input" placeholder={t('admin.phTempPw')} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <button
          className="btn-primary"
          onClick={() => run(async () => {
            await api.admin.createUser(form);
            setForm({ username: '', display_name: '', password: '' });
          })}
          disabled={form.username.length < 3 || form.password.length < 6}
        >
          {t('admin.add')}
        </button>
      </div>

      <div className="card divide-y divide-white/5">
        {active.map((u) => (
          <div key={u.id} className="flex items-center gap-3 p-3">
            <span className="text-xl">{u.avatar}</span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">
                {u.display_name} <span className="text-xs text-emerald-50/40">@{u.username}</span>
                {u.is_admin === 1 && <span className="ml-1 chip bg-oranje-500/15 text-oranje-300">{t('admin.chip')}</span>}
              </div>
              <div className="text-xs text-emerald-50/40">{t('admin.nPredictions', { n: u.prediction_count })}</div>
            </div>
            <button
              className="btn-ghost !px-2 !py-1 text-xs"
              onClick={() => {
                const pw = window.prompt(t('admin.newPwPrompt', { name: u.username }));
                if (pw) run(() => api.admin.updateUser(u.id, { password: pw }));
              }}
            >
              🔑
            </button>
            <button
              className="btn-ghost !px-2 !py-1 text-xs"
              onClick={() => {
                if (window.confirm(t('admin.deleteConfirm', { name: u.display_name }))) {
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
  const { t, tn } = useT();
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
        {t('admin.matchesNote')}
      </p>
      <ErrorNote error={error} />
      <div className="card divide-y divide-white/5">
        {matches.map((m) => (
          <div key={m.id} className="flex items-center gap-2 p-3 text-sm">
            <span className="w-24 text-xs text-emerald-50/40">{fmtDay(m.kickoff_utc)} {fmtTime(m.kickoff_utc)}</span>
            <span className="flex-1 truncate">
              {m.home_flag} {tn(m.home_code, m.home_name)} – {tn(m.away_code, m.away_name)} {m.away_flag}
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

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit ? `${tn(edit.home_code, edit.home_name)} – ${tn(edit.away_code, edit.away_name)}` : ''}>
        {edit && (
          <EditResult
            t={t}
            tn={tn}
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

function EditResult({ t, tn, match, onDone, onError }) {
  const [home, setHome] = useState(match.home_score ?? 0);
  const [away, setAway] = useState(match.away_score ?? 0);
  const [winner, setWinner] = useState(match.winner_team_id ?? '');
  const needsWinner = match.stage !== 'league' && home === away;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-4">
        <input type="number" min={0} max={20} className="input w-20 text-center text-xl" value={home} onChange={(e) => setHome(Number(e.target.value))} />
        <span className="font-bold">–</span>
        <input type="number" min={0} max={20} className="input w-20 text-center text-xl" value={away} onChange={(e) => setAway(Number(e.target.value))} />
      </div>
      {needsWinner && (
        <label className="block text-sm">
          <span className="mb-1 block text-emerald-50/60">{t('admin.whoAdvances')}</span>
          <select className="input" value={winner} onChange={(e) => setWinner(Number(e.target.value))}>
            <option value="">{t('admin.choose')}</option>
            <option value={match.home_team_id}>{match.home_flag} {tn(match.home_code, match.home_name)}</option>
            <option value={match.away_team_id}>{match.away_flag} {tn(match.away_code, match.away_name)}</option>
          </select>
        </label>
      )}
      <button
        className="btn-primary w-full"
        disabled={needsWinner && !winner}
        onClick={async () => {
          try {
            await api.admin.setResult(match.id, home, away, needsWinner ? winner : undefined);
            onDone();
          } catch (err) {
            onError(err.message);
          }
        }}
      >
        {t('admin.saveResult')}
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
          {t('admin.clearResult')}
        </button>
      )}
    </div>
  );
}

function SettingsTab() {
  const { t } = useT();
  const [dash, setDash] = useState(null);
  const [invite, setInvite] = useState('');
  const [msgTitle, setMsgTitle] = useState('');
  const [msgBody, setMsgBody] = useState('');
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    api.admin.dashboard().then((d) => {
      setDash(d);
      setInvite(d.invite_code || '');
    }).catch(() => {});
  }, []);

  if (!dash) return <Spinner />;

  async function flash(fn) {
    await fn();
    setSaved(t('common.saved'));
    setTimeout(() => setSaved(null), 2000);
  }

  return (
    <div className="space-y-4">
      {saved && <div className="text-sm text-emerald-300">{saved}</div>}

      <div className="card space-y-2 p-4">
        <h2 className="font-bold">{t('admin.sync')}</h2>
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
          {t('admin.syncToggle')}
        </label>
      </div>

      <div className="card space-y-2 p-4">
        <h2 className="font-bold">{t('admin.invite')}</h2>
        <p className="text-xs text-emerald-50/40">{t('admin.inviteHint')}</p>
        <div className="flex gap-2">
          <input className="input" value={invite} onChange={(e) => setInvite(e.target.value)} placeholder={t('admin.invitePh')} />
          <button className="btn-primary" onClick={() => flash(() => api.admin.settings({ invite_code: invite }))}>{t('common.save')}</button>
        </div>
      </div>

      <div className="card space-y-2 p-4">
        <h2 className="font-bold">{t('admin.broadcast')}</h2>
        <input className="input" placeholder={t('admin.phTitle')} value={msgTitle} onChange={(e) => setMsgTitle(e.target.value)} />
        <textarea className="input" rows={2} placeholder={t('admin.phBody')} value={msgBody} onChange={(e) => setMsgBody(e.target.value)} />
        <button
          className="btn-primary"
          disabled={!msgTitle.trim()}
          onClick={() => flash(async () => {
            await api.admin.broadcast({ title: msgTitle, body: msgBody });
            setMsgTitle('');
            setMsgBody('');
          })}
        >
          {t('admin.send')}
        </button>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, setToken } from '../services/api';
import { Avatar, ErrorNote, StatCard, Spinner } from '../components/ui';
import { fmtPoints } from '../utils/format';

const AVATARS = ['⚽', '🦁', '🐐', '🚀', '🔥', '🍀', '🧠', '🦊', '🐙', '👽', '🤖', '🐝', '🦅', '🌪️', '🧙', '🥷', '🎩', '🍟'];

export default function Profile() {
  const { user, setUser, logout } = useAuth();
  const [summary, setSummary] = useState(null);
  const [name, setName] = useState(user.display_name);
  const [teams, setTeams] = useState([]);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.predictionSummary().then(setSummary).catch(() => {});
    api.standings().then((d) => {
      setTeams(Object.values(d.groups).flat().sort((a, b) => a.name_nl.localeCompare(b.name_nl)));
    }).catch(() => {});
  }, []);

  async function save(payload) {
    setError(null);
    setMsg(null);
    try {
      const d = await api.updateMe(payload);
      setUser(d.user);
      setMsg('Opgeslagen ✓');
      setTimeout(() => setMsg(null), 2000);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Avatar emoji={user.avatar} size="lg" />
        <div>
          <h1 className="text-2xl font-black">{user.display_name}</h1>
          <p className="text-sm text-emerald-50/50">@{user.username}</p>
        </div>
      </div>

      {user.must_change_password === 1 && (
        <div className="rounded-xl border border-oranje-500/40 bg-oranje-500/10 p-3 text-sm text-oranje-200">
          ⚠️ Je gebruikt nog een tijdelijk wachtwoord — wijzig het hieronder.
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon="🎯" label="Totaal" value={fmtPoints(summary.total_points)} />
          <StatCard icon="⭐" label="Bonus" value={fmtPoints(summary.bonus_points)} />
          <StatCard icon="💥" label="Exact" value={summary.exact} />
          <StatCard icon="✅" label="Goed" value={summary.correct} />
        </div>
      )}

      <section className="card space-y-4 p-4">
        <h2 className="font-bold">Profiel</h2>
        {msg && <div className="text-sm text-emerald-300">{msg}</div>}
        <ErrorNote error={error} />

        <div>
          <label className="mb-1 block text-sm text-emerald-50/60">Avatar</label>
          <div className="flex flex-wrap gap-2">
            {AVATARS.map((a) => (
              <button
                key={a}
                onClick={() => save({ avatar: a })}
                className={`flex h-10 w-10 items-center justify-center rounded-full text-xl ${user.avatar === a ? 'bg-oranje-500/30 ring-2 ring-oranje-500' : 'bg-white/5 hover:bg-white/10'}`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-emerald-50/60">Weergavenaam</label>
          <div className="flex gap-2">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} />
            <button className="btn-primary" onClick={() => save({ display_name: name })} disabled={name.trim().length < 2}>
              Opslaan
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-emerald-50/60">Favoriet land</label>
          <select
            className="input"
            value={user.favorite_team_id || ''}
            onChange={(e) => save({ favorite_team_id: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">— geen —</option>
            {teams.map((t) => (
              <option key={t.team_id} value={t.team_id}>{t.flag} {t.name_nl}</option>
            ))}
          </select>
        </div>
      </section>

      <PushSection />

      <PasswordSection />

      <button className="btn-ghost w-full" onClick={logout}>Uitloggen</button>
    </div>
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function PushSection() {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && window.isSecureContext;
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => {});
  }, [supported]);

  if (!supported) {
    return (
      <section className="card p-4">
        <h2 className="font-bold">Pushmeldingen 🔕</h2>
        <p className="mt-1 text-sm text-emerald-50/50">
          Pushmeldingen vereisen een beveiligde verbinding (HTTPS of via Home Assistant).
          {typeof navigator !== 'undefined' && !window.isSecureContext && ' Open de app via het HA-menu of een https-adres om ze aan te zetten.'}
        </p>
      </section>
    );
  }

  async function toggle() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (subscribed) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await api.pushUnsubscribe(sub.endpoint);
          await sub.unsubscribe();
        }
        setSubscribed(false);
        setMsg('Pushmeldingen uitgezet op dit apparaat.');
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setMsg('Meldingen zijn geweigerd in je browserinstellingen.');
          return;
        }
        const { key } = await api.pushKey();
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });
        await api.pushSubscribe(sub.toJSON());
        setSubscribed(true);
        await api.pushTest();
        setMsg('Aangezet! Er komt zo een testmelding binnen 🎉');
      }
    } catch (err) {
      setMsg(`Dat lukte niet: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-2 p-4">
      <h2 className="font-bold">Pushmeldingen {subscribed ? '🔔' : '🔕'}</h2>
      <p className="text-sm text-emerald-50/50">
        Uitslagen, speelronde-herinneringen en de dagwinnaar direct op dit apparaat — ook als de app dicht is.
      </p>
      {msg && <div className="text-sm text-emerald-300">{msg}</div>}
      <button className={subscribed ? 'btn-ghost w-full' : 'btn-primary w-full'} onClick={toggle} disabled={busy}>
        {busy ? 'Even geduld…' : subscribed ? 'Zet uit op dit apparaat' : 'Zet aan op dit apparaat'}
      </button>
    </section>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const { refreshUser } = useAuth();

  async function change() {
    setError(null);
    setMsg(null);
    try {
      const d = await api.changePassword(current, next);
      if (d.token) setToken(d.token);
      await refreshUser();
      setMsg('Wachtwoord gewijzigd ✓');
      setCurrent('');
      setNext('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-bold">Wachtwoord wijzigen</h2>
      {msg && <div className="text-sm text-emerald-300">{msg}</div>}
      <ErrorNote error={error} />
      <input className="input" type="password" placeholder="Huidig wachtwoord" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      <input className="input" type="password" placeholder="Nieuw wachtwoord (min. 6 tekens)" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      <button className="btn-primary w-full" onClick={change} disabled={next.length < 6 || !current}>
        Wijzig wachtwoord
      </button>
    </section>
  );
}

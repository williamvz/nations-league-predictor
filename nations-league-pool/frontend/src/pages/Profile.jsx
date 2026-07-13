import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, setToken } from '../services/api';
import { Avatar, ErrorNote, StatCard, Spinner } from '../components/ui';
import { fmtPoints } from '../utils/format';
import { useT } from '../i18n';
import { LANGUAGES } from '../i18n/translations';

const AVATARS = ['⚽', '🦁', '🐐', '🚀', '🔥', '🍀', '🧠', '🦊', '🐙', '👽', '🤖', '🐝', '🦅', '🌪️', '🧙', '🥷', '🎩', '🍟'];

export default function Profile() {
  const { t, tn, lang } = useT();
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
      setMsg(t('common.saved'));
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
          {t('profile.tempPw')}
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon="🎯" label={t('profile.total')} value={fmtPoints(summary.total_points)} />
          <StatCard icon="⭐" label={t('profile.bonus')} value={fmtPoints(summary.bonus_points)} />
          <StatCard icon="💥" label={t('profile.exact')} value={summary.exact} />
          <StatCard icon="✅" label={t('profile.correct')} value={summary.correct} />
        </div>
      )}

      <section className="card space-y-4 p-4">
        <h2 className="font-bold">{t('profile.section')}</h2>
        {msg && <div className="text-sm text-emerald-300">{msg}</div>}
        <ErrorNote error={error} />

        <div>
          <label className="mb-1 block text-sm text-emerald-50/60">{t('profile.avatar')}</label>
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
          {teams.length > 0 && (
            <>
              <label className="mb-1 mt-3 block text-sm text-emerald-50/60">{t('profile.orFlag')}</label>
              <div className="flex flex-wrap gap-2">
                {teams.map((tm) => (
                  <button
                    key={tm.team_id}
                    title={tn(tm.code, tm.name_nl)}
                    onClick={() => save({ avatar: tm.flag })}
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-xl ${user.avatar === tm.flag ? 'bg-oranje-500/30 ring-2 ring-oranje-500' : 'bg-white/5 hover:bg-white/10'}`}
                  >
                    {tm.flag}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm text-emerald-50/60">{t('profile.displayName')}</label>
          <div className="flex gap-2">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} />
            <button className="btn-primary" onClick={() => save({ display_name: name })} disabled={name.trim().length < 2}>
              {t('common.save')}
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-emerald-50/60">{t('profile.favTeam')}</label>
          <select
            className="input"
            value={user.favorite_team_id || ''}
            onChange={(e) => save({ favorite_team_id: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">{t('common.none')}</option>
            {teams.map((tm) => (
              <option key={tm.team_id} value={tm.team_id}>{tm.flag} {tn(tm.code, tm.name_nl)}</option>
            ))}
          </select>
          <div>
            <label className="mb-1 block text-sm text-emerald-50/60">{t('profile.language')} 🌍</label>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => save({ language: l.code })}
                  className={`btn ${lang === l.code ? 'bg-oranje-500 text-pitch-950' : 'btn-ghost'} !px-3 !py-1.5`}
                >
                  {l.flag} {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <PushSection />

      <PasswordSection />

      <button className="btn-ghost w-full" onClick={logout}>{t('profile.logout')}</button>
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
  const { t } = useT();
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
        <h2 className="font-bold">{t('profile.push')} 🔕</h2>
        <p className="mt-1 text-sm text-emerald-50/50">
          {t('profile.pushNeedsHttps')}
          {typeof navigator !== 'undefined' && !window.isSecureContext && ` ${t('profile.pushHint')}`}
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
        setMsg(t('profile.pushDisabled'));
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setMsg(t('profile.pushDenied'));
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
        setMsg(t('profile.pushEnabled'));
      }
    } catch (err) {
      setMsg(t('profile.pushFail', { msg: err.message }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-2 p-4">
      <h2 className="font-bold">{t('profile.push')} {subscribed ? '🔔' : '🔕'}</h2>
      <p className="text-sm text-emerald-50/50">
        {t('profile.pushExplain')}
      </p>
      {msg && <div className="text-sm text-emerald-300">{msg}</div>}
      <button className={subscribed ? 'btn-ghost w-full' : 'btn-primary w-full'} onClick={toggle} disabled={busy}>
        {busy ? t('common.wait') : subscribed ? t('profile.pushOff') : t('profile.pushOn')}
      </button>
    </section>
  );
}

function PasswordSection() {
  const { t } = useT();
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
      setMsg(t('profile.pwChanged'));
      setCurrent('');
      setNext('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-bold">{t('profile.pwTitle')}</h2>
      {msg && <div className="text-sm text-emerald-300">{msg}</div>}
      <ErrorNote error={error} />
      <input className="input" type="password" placeholder={t('profile.pwCurrent')} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      <input className="input" type="password" placeholder={t('profile.pwNew')} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      <button className="btn-primary w-full" onClick={change} disabled={next.length < 6 || !current}>
        {t('profile.pwButton')}
      </button>
    </section>
  );
}

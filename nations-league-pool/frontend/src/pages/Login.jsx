import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { ErrorNote } from '../components/ui';
import { useT } from '../i18n';
import { LANGUAGES } from '../i18n/translations';

export default function Login() {
  const { t, lang, setLang } = useT();
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [hasInviteCode, setHasInviteCode] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', display_name: '', invite_code: '' });
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.meta().then((d) => setHasInviteCode(d.has_invite_code)).catch(() => {});
  }, []);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'login') {
        await login(form.username, form.password);
      } else {
        const d = await register(form);
        if (d.pending) {
          setMode('login');
          setNotice(t('login.pending'));
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pitch-bg flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-2 text-5xl">🏆</div>
          <h1 className="text-3xl font-black tracking-tight">
            Nations League <span className="text-oranje-500">Pool</span>
          </h1>
          <p className="mt-1 text-sm text-emerald-50/50">{t('login.subtitle')}</p>
          <div className="mt-3 flex justify-center gap-1">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                title={l.label}
                onClick={() => { localStorage.setItem('nlpool_lang_prelogin', l.code); setLang(l.code); }}
                className={`rounded-lg px-1.5 py-0.5 text-lg ${lang === l.code ? 'bg-oranje-500/25 ring-1 ring-oranje-500' : 'opacity-50 hover:opacity-100'}`}
              >
                {l.flag}
              </button>
            ))}
          </div>
        </div>

        <form className="card space-y-3 p-5" onSubmit={submit}>
          {notice && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              {notice}
            </div>
          )}
          <input
            className="input"
            placeholder={t('login.username')}
            value={form.username}
            onChange={(e) => set('username', e.target.value)}
            autoCapitalize="none"
            autoComplete="username"
            required
          />
          <input
            className="input"
            type="password"
            placeholder={t('login.password')}
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
          />
          {mode === 'register' && (
            <>
              <input
                className="input"
                placeholder={t('login.displayName')}
                value={form.display_name}
                onChange={(e) => set('display_name', e.target.value)}
              />
              {hasInviteCode && (
                <input
                  className="input"
                  placeholder={t('login.inviteCode')}
                  value={form.invite_code}
                  onChange={(e) => set('invite_code', e.target.value)}
                />
              )}
              <p className="text-xs text-emerald-50/40">
                {hasInviteCode ? t('login.inviteHintWith') : t('login.inviteHintWithout')}
              </p>
            </>
          )}
          <ErrorNote error={error} />
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? t('common.wait') : mode === 'login' ? t('login.login') : t('login.register')}
          </button>
          <button
            type="button"
            className="w-full text-center text-sm text-emerald-50/50 hover:text-oranje-300"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
              setNotice(null);
            }}
          >
            {mode === 'login' ? t('login.toRegister') : t('login.toLogin')}
          </button>
        </form>
      </div>
    </div>
  );
}

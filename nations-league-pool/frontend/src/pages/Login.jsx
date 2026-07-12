import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { ErrorNote } from '../components/ui';

export default function Login() {
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
          setNotice('Aanmelding ontvangen! ⏳ Zodra William je goedkeurt kun je hier inloggen.');
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
          <p className="mt-1 text-sm text-emerald-50/50">2026/27 · League A · voorspel & win 🇳🇱</p>
        </div>

        <form className="card space-y-3 p-5" onSubmit={submit}>
          {notice && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              {notice}
            </div>
          )}
          <input
            className="input"
            placeholder="Gebruikersnaam"
            value={form.username}
            onChange={(e) => set('username', e.target.value)}
            autoCapitalize="none"
            autoComplete="username"
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Wachtwoord"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
          />
          {mode === 'register' && (
            <>
              <input
                className="input"
                placeholder="Weergavenaam (bijv. Pepijn)"
                value={form.display_name}
                onChange={(e) => set('display_name', e.target.value)}
              />
              {hasInviteCode && (
                <input
                  className="input"
                  placeholder="Uitnodigingscode (optioneel)"
                  value={form.invite_code}
                  onChange={(e) => set('invite_code', e.target.value)}
                />
              )}
              <p className="text-xs text-emerald-50/40">
                {hasInviteCode
                  ? 'Met een geldige code doe je direct mee; zonder code keurt de beheerder je aanmelding eerst goed.'
                  : 'Na je aanmelding keurt de beheerder je account goed — daarna kun je inloggen.'}
              </p>
            </>
          )}
          <ErrorNote error={error} />
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'Even geduld…' : mode === 'login' ? 'Inloggen' : 'Aanmelden'}
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
            {mode === 'login' ? 'Nog geen account? Meld je aan →' : '← Terug naar inloggen'}
          </button>
        </form>
      </div>
    </div>
  );
}

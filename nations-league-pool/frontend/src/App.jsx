import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider, useT } from './i18n';
import { api } from './services/api';
import Layout from './components/Layout';
import Login from './pages/Login';
import Home from './pages/Home';
import Matches from './pages/Matches';
import Leaderboard from './pages/Leaderboard';
import Standings from './pages/Standings';
import Bonus from './pages/Bonus';
import Achievements from './pages/Achievements';
import Profile from './pages/Profile';
import More from './pages/More';
import Admin from './pages/Admin';
import TV from './pages/TV';
import Sportkrant from './pages/Sportkrant';
import KristallenBol from './pages/KristallenBol';
import Blitz from './pages/Blitz';
import { Spinner } from './components/ui';

function Shell() {
  const { user, loading } = useAuth();
  const { setLang } = useT();

  // the account's language follows the user across devices; an explicit
  // pre-login choice on this device wins once and is saved to the account
  useEffect(() => {
    if (!user) return;
    const prelogin = localStorage.getItem('nlpool_lang_prelogin');
    if (prelogin && prelogin !== user.language) {
      localStorage.removeItem('nlpool_lang_prelogin');
      setLang(prelogin);
      api.updateMe({ language: prelogin }).catch(() => {});
    } else {
      localStorage.removeItem('nlpool_lang_prelogin');
      if (user.language) setLang(user.language);
    }
  }, [user, setLang]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!user) return <Login />;

  return (
    <Routes>
      <Route path="/tv" element={<TV />} />
      <Route path="*" element={<AppRoutes user={user} />} />
    </Routes>
  );
}

function AppRoutes({ user }) {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/wedstrijden" element={<Matches />} />
        <Route path="/wedstrijden/:id" element={<Matches />} />
        <Route path="/ranglijst" element={<Leaderboard />} />
        <Route path="/stand" element={<Standings />} />
        <Route path="/bonus" element={<Bonus />} />
        <Route path="/prestaties" element={<Achievements />} />
        <Route path="/sportkrant" element={<Sportkrant />} />
        <Route path="/kristallen-bol" element={<KristallenBol />} />
        <Route path="/blitz" element={<Blitz />} />
        <Route path="/profiel" element={<Profile />} />
        <Route path="/meer" element={<More />} />
        {user.is_admin === 1 && <Route path="/admin" element={<Admin />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  // HashRouter: works identically on a bare port and behind HA ingress,
  // with zero server-side path configuration.
  return (
    <HashRouter>
      <LanguageProvider>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </LanguageProvider>
    </HashRouter>
  );
}

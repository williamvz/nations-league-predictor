import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
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
import { Spinner } from './components/ui';

function Shell() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!user) return <Login />;

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
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </HashRouter>
  );
}

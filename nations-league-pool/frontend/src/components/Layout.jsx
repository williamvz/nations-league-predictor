import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Avatar, Modal } from './ui';
import GoalFlash from './GoalFlash';

const NAV = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/wedstrijden', label: 'Wedstrijden', icon: '⚽' },
  { to: '/ranglijst', label: 'Ranglijst', icon: '🏆' },
  { to: '/stand', label: 'Stand', icon: '📊' },
  { to: '/meer', label: 'Meer', icon: '☰' },
];

export default function Layout({ children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [demoMode, setDemoMode] = useState(false);
  const [unread, setUnread] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [popup, setPopup] = useState(null);
  const seenRef = useRef(false);

  // poll notifications + fresh achievements (+ pending registrations for admins)
  useEffect(() => {
    api.meta().then((d) => setDemoMode(!!d.demo_mode)).catch(() => {});
  }, []);

  useEffect(() => {
    let stop = false;
    async function poll() {
      try {
        const d = await api.notifications();
        if (!stop) setUnread(d.unread);
        if (user?.is_admin === 1) {
          const dash = await api.admin.dashboard();
          if (!stop) setPendingCount(dash.pending_users || 0);
        }
        const a = await api.unseenAchievements();
        if (!stop && a.achievements.length > 0 && !seenRef.current) {
          seenRef.current = true;
          setPopup(a.achievements[0]);
          confetti({ particleCount: 140, spread: 75, origin: { y: 0.7 } });
          await api.markAchievementsSeen();
          setTimeout(() => {
            seenRef.current = false;
            setPopup(null);
          }, 6000);
        }
      } catch {
        /* offline is fine */
      }
    }
    poll();
    const t = setInterval(poll, 60_000);
    // instant feedback after saving a prediction/bonus/etc.
    let debounce = null;
    const onActivity = () => {
      clearTimeout(debounce);
      debounce = setTimeout(poll, 400); // give the backend a beat to finish achievement checks
    };
    window.addEventListener('nlpool:activity', onActivity);
    return () => {
      stop = true;
      clearInterval(t);
      clearTimeout(debounce);
      window.removeEventListener('nlpool:activity', onActivity);
    };
  }, []);

  async function openNotifications() {
    setNotifOpen(true);
    try {
      const d = await api.notifications();
      setNotifications(d.notifications);
      if (d.unread > 0) {
        await api.markAllNotificationsRead();
        setUnread(0);
      }
    } catch {
      /* ignore */
    }
  }

  async function handleRegistration(notification, action) {
    const userId = notification.meta?.pending_user_id;
    let result;
    try {
      if (action === 'approve') await api.admin.approveUser(userId);
      else await api.admin.rejectUser(userId);
      result = action === 'approve' ? 'approved' : 'rejected';
    } catch {
      result = 'gone'; // already handled elsewhere (or user no longer pending)
    }
    setNotifications((list) =>
      list.map((n) => (n.id === notification.id ? { ...n, handled: result } : n))
    );
    try {
      const dash = await api.admin.dashboard();
      setPendingCount(dash.pending_users || 0);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="pitch-bg min-h-screen">
      {/* top bar */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-pitch-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <button className="flex items-center gap-2" onClick={() => navigate('/')}>
            <span className="text-xl">🏆</span>
            <span className="font-black tracking-tight">
              Nations League <span className="text-oranje-500">Pool</span>
            </span>
          </button>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV.slice(0, 4).map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `rounded-xl px-3 py-1.5 text-sm font-semibold ${isActive ? 'bg-oranje-500/15 text-oranje-300' : 'text-emerald-50/60 hover:bg-white/5'}`
                }
              >
                {n.icon} {n.label}
              </NavLink>
            ))}
            <NavLink
              to="/meer"
              className={({ isActive }) =>
                `relative rounded-xl px-3 py-1.5 text-sm font-semibold ${isActive ? 'bg-oranje-500/15 text-oranje-300' : 'text-emerald-50/60 hover:bg-white/5'}`
              }
            >
              ☰ Meer
              {pendingCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-oranje-500 px-1 text-[10px] font-bold text-pitch-950">
                  {pendingCount}
                </span>
              )}
            </NavLink>
          </nav>

          <div className="flex items-center gap-2">
            <button className="relative rounded-full p-1.5 hover:bg-white/5" onClick={openNotifications}>
              <span className="text-xl">🔔</span>
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-oranje-500 px-1 text-[10px] font-bold text-pitch-950">
                  {unread}
                </span>
              )}
            </button>
            <button onClick={() => navigate('/profiel')} title={user?.display_name}>
              <Avatar emoji={user?.avatar || '⚽'} size="sm" />
            </button>
          </div>
        </div>
      </header>

      {demoMode && (
        <div className="border-b border-purple-500/30 bg-purple-500/15 px-4 py-1.5 text-center text-xs font-semibold text-purple-200">
          🧪 DEMO-MODUS — gesimuleerd oefenseizoen, telt nergens voor. Zet <code>demo_mode</code> uit voor het echte werk.
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 pb-28 pt-4 md:pb-8">{children}</main>

      <GoalFlash />

      {/* mobile bottom nav */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-pitch-950/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${isActive ? 'text-oranje-400' : 'text-emerald-50/50'}`
              }
            >
              <span className="relative text-lg">
                {n.icon}
                {n.to === '/meer' && pendingCount > 0 && (
                  <span className="absolute -right-2.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-oranje-500 px-1 text-[10px] font-bold text-pitch-950">
                    {pendingCount}
                  </span>
                )}
              </span>
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* achievement popup */}
      {popup && (
        <div className="fixed inset-x-4 top-16 z-50 mx-auto max-w-sm">
          <div className="card border-oranje-500/40 p-4 text-center shadow-2xl">
            <div className="text-3xl">{popup.icon}</div>
            <div className="mt-1 font-black text-oranje-300">Prestatie ontgrendeld!</div>
            <div className="font-semibold">{popup.name}</div>
            <div className="text-sm text-emerald-50/60">{popup.description}</div>
          </div>
        </div>
      )}

      {/* notifications */}
      <Modal open={notifOpen} onClose={() => setNotifOpen(false)} title="Meldingen 🔔">
        {notifications.length === 0 && <p className="py-6 text-center text-emerald-50/50">Nog geen meldingen.</p>}
        <div className="space-y-2">
          {notifications.map((n) => (
            <div key={n.id} className={`rounded-xl p-3 ${n.is_read ? 'bg-white/[0.03]' : 'bg-oranje-500/10'}`}>
              <div className="text-sm font-semibold">{n.title}</div>
              {n.body && <div className="text-sm text-emerald-50/60">{n.body}</div>}
              {n.type === 'registration' && n.meta?.pending_user_id && user?.is_admin === 1 && (
                n.handled ? (
                  <div className="mt-2 text-sm text-emerald-50/50">
                    {n.handled === 'approved' && '✓ Goedgekeurd'}
                    {n.handled === 'rejected' && '✕ Afgewezen'}
                    {n.handled === 'gone' && 'Al verwerkt'}
                  </div>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <button
                      className="btn flex-1 bg-emerald-500 !py-1.5 text-pitch-950 hover:bg-emerald-400"
                      onClick={() => handleRegistration(n, 'approve')}
                    >
                      ✓ Goedkeuren
                    </button>
                    <button className="btn-ghost flex-1 !py-1.5" onClick={() => handleRegistration(n, 'reject')}>
                      ✕ Afwijzen
                    </button>
                  </div>
                )
              )}
              <div className="mt-1 text-xs text-emerald-50/40">
                {new Date(n.created_at.replace(' ', 'T') + 'Z').toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' })}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

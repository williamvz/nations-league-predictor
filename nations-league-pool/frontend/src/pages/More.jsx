import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { useT } from '../i18n';

export default function More() {
  const { t } = useT();
  const { user, logout } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (user?.is_admin === 1) {
      api.admin.dashboard().then((d) => setPendingCount(d.pending_users || 0)).catch(() => {});
    }
  }, [user]);

  const items = [
    { to: '/blitz', icon: '⚡', label: t('more.blitz'), sub: t('more.blitzSub') },
    { to: '/bonus', icon: '⭐', label: t('more.bonus'), sub: t('more.bonusSub') },
    { to: '/sportkrant', icon: '📰', label: t('more.krant'), sub: t('more.krantSub') },
    { to: '/kristallen-bol', icon: '🔮', label: t('more.bol'), sub: t('more.bolSub') },
    { to: '/prestaties', icon: '🏅', label: t('more.ach'), sub: t('more.achSub') },
    { to: '/tv', icon: '📺', label: t('more.tv'), sub: t('more.tvSub') },
    { to: '/profiel', icon: '👤', label: t('more.profile'), sub: t('more.profileSub') },
  ];
  if (user?.is_admin === 1) {
    items.push({
      to: '/admin', icon: '🛠️', label: t('more.admin'),
      sub: pendingCount > 0 ? t('more.adminPending', { n: pendingCount }) : t('more.adminSub'),
      badge: pendingCount || undefined,
    });
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black">{t('more.title')}</h1>
      <div className="space-y-2">
        {items.map((i) => (
          <Link key={i.to} to={i.to} className="card flex items-center gap-4 p-4 hover:bg-white/[0.04]">
            <span className="text-2xl">{i.icon}</span>
            <span className="flex-1">
              <span className="block font-bold">
                {i.label}
                {i.badge && (
                  <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-oranje-500 px-1.5 text-xs font-bold text-pitch-950">
                    {i.badge}
                  </span>
                )}
              </span>
              <span className={`text-sm ${i.badge ? 'text-oranje-300' : 'text-emerald-50/50'}`}>{i.sub}</span>
            </span>
            <span className="text-emerald-50/30">→</span>
          </Link>
        ))}
      </div>

      <button className="btn-ghost w-full" onClick={logout}>
        {t('profile.logout')}
      </button>

      <div className="pt-4 text-center text-xs text-emerald-50/30">
        <div className="mb-1 font-semibold">{t('more.scoring')}</div>
        <div>{t('more.scoringLine')}</div>
        <div>{t('more.scoringKo')}</div>
        <div className="mt-2">{t('more.auto')}</div>
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function More() {
  const { user, logout } = useAuth();

  const items = [
    { to: '/bonus', icon: '⭐', label: 'Bonusvragen', sub: 'Groepswinnaars, topscorer & meer' },
    { to: '/prestaties', icon: '🏅', label: 'Prestaties', sub: 'Jouw ontgrendelde badges' },
    { to: '/profiel', icon: '👤', label: 'Profiel', sub: 'Avatar, favoriet land, wachtwoord' },
  ];
  if (user?.is_admin === 1) {
    items.push({ to: '/admin', icon: '🛠️', label: 'Beheer', sub: 'Gebruikers, sync & instellingen' });
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black">Meer</h1>
      <div className="space-y-2">
        {items.map((i) => (
          <Link key={i.to} to={i.to} className="card flex items-center gap-4 p-4 hover:bg-white/[0.04]">
            <span className="text-2xl">{i.icon}</span>
            <span className="flex-1">
              <span className="block font-bold">{i.label}</span>
              <span className="text-sm text-emerald-50/50">{i.sub}</span>
            </span>
            <span className="text-emerald-50/30">→</span>
          </Link>
        ))}
      </div>

      <button className="btn-ghost w-full" onClick={logout}>
        Uitloggen
      </button>

      <div className="pt-4 text-center text-xs text-emerald-50/30">
        <div className="mb-1 font-semibold">Puntentelling</div>
        <div>Exacte uitslag 5 · winnaar + doelsaldo 3 · winnaar 2 · 🃏 joker ×2</div>
        <div className="mt-2">Uitslagen, stand en topscorers worden automatisch bijgewerkt ⚙️</div>
      </div>
    </div>
  );
}

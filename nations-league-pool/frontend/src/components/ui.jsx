import { useEffect, useState } from 'react';
import { countdownParts } from '../utils/format';
import { useT } from '../i18n';

export function Spinner({ label }) {
  const { t } = useT();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-emerald-50/60">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-oranje-500" />
      <span className="text-sm">{label || t('common.loading')}</span>
    </div>
  );
}

export function Avatar({ emoji, size = 'md' }) {
  const sizes = { sm: 'h-8 w-8 text-base', md: 'h-10 w-10 text-xl', lg: 'h-16 w-16 text-3xl' };
  return (
    <div className={`${sizes[size]} flex items-center justify-center rounded-full bg-gradient-to-br from-pitch-600 to-pitch-800 ring-1 ring-white/10`}>
      <span>{emoji}</span>
    </div>
  );
}

export function LiveDot() {
  return (
    <span className="chip bg-red-500/15 text-red-400">
      <span className="h-2 w-2 animate-pulse-live rounded-full bg-red-500" />
      LIVE
    </span>
  );
}

export function Countdown({ iso, prefix = '' }) {
  const { t } = useT();
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const p = countdownParts(iso);
  if (!p) return <span className="text-red-400">{t('common.started')}</span>;

  let text;
  let cls = 'text-emerald-50/70';
  if (p.days > 0) text = `${p.days}${t('common.dayShort')} ${p.hours}${t('common.hourShort')}`;
  else if (p.totalHours >= 1) {
    text = `${p.hours}${t('common.hourShort')} ${String(p.minutes).padStart(2, '0')}m`;
    cls = 'text-oranje-300';
  } else {
    text = `${p.minutes}:${String(p.seconds).padStart(2, '0')}`;
    cls = 'animate-pulse-live font-bold text-red-400';
  }
  return <span className={cls}>{prefix}{text}</span>;
}

export function Modal({ open, onClose, title, children, wide = false }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className={`card max-h-[88vh] w-full overflow-y-auto rounded-b-none p-5 sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="btn-ghost h-8 w-8 rounded-full !p-0" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function StatCard({ icon, label, value, sub }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className="text-2xl">{icon}</div>
      <div className="min-w-0">
        <div className="truncate text-xs uppercase tracking-wide text-emerald-50/50">{label}</div>
        <div className="text-xl font-bold">{value}</div>
        {sub && <div className="text-xs text-emerald-50/50">{sub}</div>}
      </div>
    </div>
  );
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>;
}

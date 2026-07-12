import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Spinner } from '../components/ui';

const RARITY = {
  common: { label: 'Gewoon', cls: 'text-emerald-50/50' },
  uncommon: { label: 'Bijzonder', cls: 'text-emerald-300' },
  rare: { label: 'Zeldzaam', cls: 'text-sky-300' },
  legendary: { label: 'Legendarisch', cls: 'text-oranje-300' },
};

export default function Achievements() {
  const [list, setList] = useState(null);

  useEffect(() => {
    api.achievements().then((d) => setList(d.achievements)).catch(() => {});
  }, []);

  if (!list) return <Spinner />;
  const unlocked = list.filter((a) => a.unlocked_at).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">Prestaties</h1>
        <span className="chip bg-oranje-500/15 text-oranje-300">{unlocked}/{list.length}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full bg-oranje-500 transition-all" style={{ width: `${(unlocked / list.length) * 100}%` }} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((a) => {
          const done = !!a.unlocked_at;
          return (
            <div key={a.key} className={`card flex items-center gap-3 p-4 ${done ? 'border-oranje-500/20' : 'opacity-60'}`}>
              <div className={`text-3xl ${done ? '' : 'grayscale'}`}>{done ? a.icon : '🔒'}</div>
              <div className="min-w-0 flex-1">
                <div className="font-bold">{done ? a.name : '???'}</div>
                <div className="text-sm text-emerald-50/50">{a.description}</div>
                <div className={`text-xs ${RARITY[a.rarity].cls}`}>
                  {RARITY[a.rarity].label} · {a.unlock_percentage}% heeft deze
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

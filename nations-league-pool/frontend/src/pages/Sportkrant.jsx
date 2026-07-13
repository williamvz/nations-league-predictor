import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Spinner } from '../components/ui';
import { useT } from '../i18n';

/** Bold **text** segments without any HTML injection. */
function RichLine({ text }) {
  const parts = text.split('**');
  return (
    <p className="leading-relaxed">
      {parts.map((part, i) => (i % 2 === 1 ? <b key={i} className="text-oranje-300">{part}</b> : part))}
    </p>
  );
}

export default function Sportkrant() {
  const { t, lang } = useT();
  const [recaps, setRecaps] = useState(null);

  useEffect(() => {
    api.recaps().then((d) => setRecaps(d.recaps)).catch(() => {});
  }, []);

  if (!recaps) return <Spinner />;

  async function share(r) {
    const text = `${r.title}\n\n${r.body.replaceAll('**', '')}`;
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch { /* cancelled */ }
    }
    await navigator.clipboard?.writeText(text);
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black">{t('krant.title')}</h1>
      <p className="text-sm text-emerald-50/50">
        {t('krant.subtitle')}{lang !== 'nl' && <span className="block">{t('krant.dutchNote')}</span>}
      </p>

      {recaps.length === 0 && (
        <div className="card p-8 text-center text-emerald-50/50">
          <div className="mb-2 text-4xl">🗞️</div>
          {t('krant.empty')}
        </div>
      )}

      {recaps.map((r) => (
        <article key={r.matchday} className="card space-y-3 p-5">
          <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-3">
            <h2 className="font-black">{r.title}</h2>
            <button className="btn-ghost !px-3 !py-1 text-sm" onClick={() => share(r)} title="Deel dit verslag">
              📤
            </button>
          </div>
          <div className="space-y-3 text-[15px]">
            {r.body.split('\n\n').map((line, i) => <RichLine key={i} text={line} />)}
          </div>
        </article>
      ))}
    </div>
  );
}

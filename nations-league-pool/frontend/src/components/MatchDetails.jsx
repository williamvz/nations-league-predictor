// Rich match information from the provider: timeline, statistics, line-ups,
// live commentary and the post-match recap. Every section is optional —
// smaller matches often lack commentary or a written report.
import { useMemo, useState } from 'react';
import { fmtFull } from '../utils/format';
import { commentaryToDutch } from '../utils/commentaryNl';

const EVENT_ICON = {
  goal: '⚽', penalty_goal: '⚽', own_goal: '⚽', penalty_missed: '❌',
  yellow_card: '🟨', red_card: '🟥', substitution: '🔄', var: '📺', period: '⏱️',
};

/** Tabs that have content for this match, in display order. */
export function detailTabs(d, { hasPool }) {
  const tabs = ['overview'];
  if (d?.stats?.length) tabs.push('stats');
  if (d?.lineups?.home || d?.lineups?.away) tabs.push('lineups');
  if (d?.commentary?.length) tabs.push('live');
  if (d?.article) tabs.push('report');
  if (hasPool) tabs.push('pool');
  return tabs;
}

export function TabBar({ t, tabs, active, onChange }) {
  if (tabs.length < 2) return null;
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto pb-1" role="tablist">
      {tabs.map((k) => (
        <button
          key={k}
          role="tab"
          aria-selected={active === k}
          data-testid={`tab-${k}`}
          onClick={() => onChange(k)}
          className={`chip shrink-0 transition ${active === k ? 'bg-oranje-500 text-pitch-950' : 'bg-white/5 text-emerald-50/70 hover:bg-white/10'}`}
        >
          {t(`detail.tab.${k}`)}
        </button>
      ))}
    </div>
  );
}

function sideCode(m, side) {
  return side === 'home' ? m.home_code : side === 'away' ? m.away_code : '';
}

export function Timeline({ t, m, details }) {
  const items = details?.timeline || [];
  if (!items.length) return null;
  return (
    <div className="card p-3" data-testid="timeline">
      <h3 className="mb-2 text-sm font-bold text-emerald-50/60">📋 {t('detail.timeline')}</h3>
      <ol className="space-y-1">
        {items.map((e) => {
          if (e.kind === 'period') {
            return (
              <li key={e.id} className="my-1 text-center text-[11px] uppercase tracking-wide text-emerald-50/40">
                — {t(`detail.period.${periodKey(e.text)}`)} —
              </li>
            );
          }
          const away = e.side === 'away';
          return (
            <li key={e.id} className={`flex items-center gap-2 text-sm ${away ? 'flex-row-reverse text-right' : ''}`}>
              <span className="w-9 shrink-0 text-center text-xs tabular-nums text-emerald-50/40">{e.minute}</span>
              <span>{EVENT_ICON[e.kind] || '•'}</span>
              <span className="min-w-0">
                <span className="font-medium">{e.player || t(`detail.event.${e.kind}`)}</span>
                {e.kind === 'substitution' && e.related && (
                  <span className="block text-xs text-emerald-50/40">↔ {e.related}</span>
                )}
                {(e.kind === 'goal' || e.kind === 'penalty_goal') && e.related && (
                  <span className="block text-xs text-emerald-50/40">{t('detail.assist', { name: e.related })}</span>
                )}
                {e.kind !== 'substitution' && e.kind !== 'goal' && e.player && (
                  <span className="block text-xs text-emerald-50/40">{t(`detail.event.${e.kind}`)}</span>
                )}
              </span>
              <span className="mx-1 text-[10px] text-emerald-50/30">{sideCode(m, e.side)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function periodKey(text = '') {
  const s = String(text).toLowerCase();
  if (/half/.test(s)) return 'half';
  if (/full|end regular/.test(s)) return 'full';
  if (/extra/.test(s)) return 'extra';
  if (/kick|start/.test(s)) return 'start';
  return 'other';
}

export function MatchInfo({ t, details, m }) {
  const i = details?.info;
  if (!i || !(i.venue || i.referee || i.attendance)) return null;
  return (
    <div className="card grid grid-cols-1 gap-1 p-3 text-sm sm:grid-cols-2" data-testid="match-info">
      {i.venue && <div>🏟️ {i.venue}{i.city ? <span className="text-emerald-50/40"> · {i.city}</span> : null}</div>}
      {i.referee && <div>🧑‍⚖️ {t('detail.referee')}: {i.referee}</div>}
      {i.attendance ? <div>👥 {t('detail.attendance', { n: i.attendance.toLocaleString() })}</div> : null}
      <div className="text-emerald-50/40">🗓️ {fmtFull(m.kickoff_utc)}</div>
    </div>
  );
}

export function HeadToHead({ t, details, m, tn }) {
  const games = details?.h2h || [];
  if (!games.length) return null;
  return (
    <div className="card p-3" data-testid="h2h">
      <h3 className="mb-2 text-sm font-bold text-emerald-50/60">🤝 {t('detail.h2h')}</h3>
      {games.map((g, idx) => (
        <div key={idx} className="flex items-center gap-2 py-0.5 text-sm">
          <span className="w-20 text-xs text-emerald-50/40">{String(g.date).slice(0, 10)}</span>
          <span className="flex-1 truncate">{tn(m.home_code, m.home_name)}</span>
          <span className="font-semibold tabular-nums">{g.homeScore}–{g.awayScore}</span>
          <span className="flex-1 truncate text-right">{tn(m.away_code, m.away_name)}</span>
        </div>
      ))}
    </div>
  );
}

const PCT_KEYS = new Set(['possessionPct', 'passPct']);

export function Stats({ t, details, m }) {
  const stats = details?.stats || [];
  if (!stats.length) return <p className="text-sm text-emerald-50/40">{t('detail.noStats')}</p>;
  return (
    <div className="card space-y-3 p-4" data-testid="stats">
      <div className="flex justify-between text-sm font-bold">
        <span>{m.home_flag} {m.home_code}</span>
        <span>{m.away_code} {m.away_flag}</span>
      </div>
      {stats.map((s) => {
        const total = s.home + s.away;
        const hp = total > 0 ? (s.home / total) * 100 : 50;
        const pct = PCT_KEYS.has(s.key) ? '%' : '';
        const lead = s.home === s.away ? null : s.home > s.away ? 'home' : 'away';
        return (
          <div key={s.key} data-testid={`stat-${s.key}`}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className={`tabular-nums ${lead === 'home' ? 'font-bold' : 'text-emerald-50/70'}`}>{s.home}{pct}</span>
              <span className="text-xs text-emerald-50/50">{t(`stat.${s.key}`)}</span>
              <span className={`tabular-nums ${lead === 'away' ? 'font-bold' : 'text-emerald-50/70'}`}>{s.away}{pct}</span>
            </div>
            <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-white/5">
              <div className="rounded-l-full bg-oranje-500" style={{ width: `${hp}%` }} />
              <div className="flex-1 rounded-r-full bg-emerald-400/70" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlayerRow({ p, t }) {
  return (
    <li className="flex items-center gap-2 py-0.5 text-sm">
      <span className="w-6 text-right text-xs tabular-nums text-emerald-50/40">{p.jersey || ''}</span>
      <span className="w-5 text-[10px] text-emerald-50/40">{p.position || ''}</span>
      <span className="min-w-0 flex-1 truncate">{p.name}</span>
      {p.subbedOut && <span title={t('detail.subbedOut')} className="text-xs text-red-400">▼</span>}
      {p.subbedIn && <span title={t('detail.subbedIn')} className="text-xs text-emerald-400">▲</span>}
    </li>
  );
}

export function Lineups({ t, details, m, tn }) {
  const l = details?.lineups || {};
  const sides = ['home', 'away'].filter((s) => l[s]);
  if (!sides.length) return <p className="text-sm text-emerald-50/40">{t('detail.noLineups')}</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="lineups">
      {sides.map((side) => (
        <div key={side} className="card p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-bold">{side === 'home' ? m.home_flag : m.away_flag} {tn(sideCode(m, side), side === 'home' ? m.home_name : m.away_name)}</h3>
            {l[side].formation && <span className="chip bg-white/5 text-emerald-50/70">{l[side].formation}</span>}
          </div>
          <ul>{l[side].starters.map((p, i) => <PlayerRow key={i} p={p} t={t} />)}</ul>
          {l[side].bench?.length > 0 && (
            <>
              <div className="mb-1 mt-3 text-xs font-bold uppercase tracking-wide text-emerald-50/40">{t('detail.bench')}</div>
              <ul className="opacity-80">{l[side].bench.map((p, i) => <PlayerRow key={i} p={p} t={t} />)}</ul>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

const HIGHLIGHT = {
  goal: 'border-l-oranje-500 bg-oranje-500/10', penalty_goal: 'border-l-oranje-500 bg-oranje-500/10', own_goal: 'border-l-oranje-500 bg-oranje-500/10',
  red_card: 'border-l-red-500 bg-red-500/10', yellow_card: 'border-l-yellow-400', var: 'border-l-sky-400',
};

export function Commentary({ t, details, live, lang }) {
  const items = details?.commentary || [];
  // ESPN writes the commentary in English; Dutch readers get a rule-based
  // translation with the original one tap away
  const canTranslate = lang === 'nl' && details?.provider !== 'sim';
  const [original, setOriginal] = useState(false);
  const shown = useMemo(
    () => items.map((c) => ({ ...c, nl: canTranslate ? commentaryToDutch(c.text).text : c.text })),
    [items, canTranslate],
  );
  if (!items.length) return <p className="text-sm text-emerald-50/40">{t('detail.noCommentary')}</p>;
  return (
    <div className="space-y-1" data-testid="commentary">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-emerald-50/40">
        <span>{live ? t('detail.liveRefresh') : ''}</span>
        {canTranslate && (
          <button className="chip shrink-0 bg-white/5 text-emerald-50/60 hover:bg-white/10" onClick={() => setOriginal((o) => !o)} data-testid="commentary-toggle">
            {original ? '🇳🇱 Vertaald' : '🇬🇧 Origineel'}
          </button>
        )}
      </div>
      {shown.map((c) => (
        <div key={c.seq} className={`flex gap-3 rounded-lg border-l-2 border-l-white/10 px-2 py-1.5 text-sm ${HIGHLIGHT[c.kind] || ''}`}>
          <span className="w-9 shrink-0 text-xs font-semibold tabular-nums text-emerald-50/50">{c.minute || ''}</span>
          <span className="flex-1">{original ? c.text : c.nl}</span>
        </div>
      ))}
    </div>
  );
}

export function Report({ t, details }) {
  const a = details?.article;
  if (!a) return <p className="text-sm text-emerald-50/40">{t('detail.noReport')}</p>;
  return (
    <article className="card space-y-3 p-4" data-testid="report">
      {a.headline && <h3 className="text-lg font-black leading-tight">{a.headline}</h3>}
      {a.paragraphs.map((p, i) => <p key={i} className="text-sm leading-relaxed text-emerald-50/80">{p}</p>)}
      {a.url && (
        <a href={a.url} target="_blank" rel="noreferrer noopener" className="inline-block text-xs text-oranje-300 underline">
          {t('detail.readMore')}
        </a>
      )}
      {details.provider === 'espn' && <p className="text-[11px] text-emerald-50/30">{t('detail.sourceEspn')}</p>}
    </article>
  );
}

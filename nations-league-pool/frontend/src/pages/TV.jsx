import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { Spinner, LiveDot } from '../components/ui';
import GoalFlash from '../components/GoalFlash';
import { fmtDay, fmtTime, fmtPoints } from '../utils/format';
import { useT } from '../i18n';
import { Badge } from '../components/MatchDetails';
import { commentaryKind, HEADLINE_KINDS } from '../utils/commentaryKind';
import { commentaryToDutch } from '../utils/commentaryNl';
import { actingSide, estimateTime } from '../utils/commentaryTeam';

const FEED_SIZE = 14;
const RECENT_MS = 3 * 3600_000; // finished matches keep feeding for a while

/**
 * One combined commentary feed for every live (and just finished) match,
 * newest first: flag of the acting team, minute, badge, text.
 */
function buildFeed(matches, lang) {
  const lines = [];
  for (const m of matches) {
    for (const c of m.details?.commentary || []) {
      if (!c.text) continue;
      const kind = commentaryKind(c.text, c.kind);
      const side = HEADLINE_KINDS.has(kind) ? null : actingSide(c.text, m.home_code, m.away_code);
      const translate = lang === 'nl' && m.details?.provider !== 'sim';
      lines.push({
        key: `${m.id}-${c.seq}`,
        match: m,
        minute: c.minute,
        kind,
        side,
        text: translate ? commentaryToDutch(c.text).text : c.text,
        seen: c.seen || 0,
        est: estimateTime(m.kickoff_utc, c.minute) ?? 0,
        seq: c.seq,
      });
    }
  }
  // real arrival order first; within one sync batch fall back to the match clock
  lines.sort((a, b) => b.seen - a.seen || b.est - a.est || b.seq - a.seq);
  return lines.slice(0, FEED_SIZE);
}

/**
 * TV-modus: full-screen matchday dashboard for the living-room TV or a Home
 * Assistant dashboard card. Live scoreboards with goals, the family
 * leaderboard reshuffling live, and the upcoming schedule. Refreshes itself.
 */
export default function TV() {
  const { t, tn, lang } = useT();
  const [data, setData] = useState(null);
  const langRef = useRef(lang);
  langRef.current = lang;
  const [clock, setClock] = useState(new Date());

  async function load() {
    const [all, leaderboard] = await Promise.all([api.matches(), api.leaderboard()]);
    const matches = all.matches;
    const live = matches.filter((m) => m.status === 'live');
    const justFinished = matches.filter((m) => m.status === 'finished'
      && Date.now() - new Date(m.kickoff_utc).getTime() < RECENT_MS);
    // enrich live (and just-finished) matches with goals + commentary
    const enrich = (list) => Promise.all(list.map((m) => api.match(m.id).then((d) => d.match).catch(() => m)));
    const [detailed, finishedDetailed] = await Promise.all([enrich(live), enrich(justFinished)]);
    const upcoming = matches.filter((m) => m.status === 'scheduled').slice(0, 6);
    const recent = matches.filter((m) => m.status === 'finished').slice(-4).reverse();
    setData({ live: detailed, upcoming, recent, leaderboard, feed: buildFeed([...detailed, ...finishedDetailed], langRef.current) });
  }

  useEffect(() => {
    load().catch(() => {});
    const t = setInterval(() => load().catch(() => {}), 15_000);
    const c = setInterval(() => setClock(new Date()), 1000);
    return () => {
      clearInterval(t);
      clearInterval(c);
    };
  }, []);

  if (!data) return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>;
  const { live, upcoming, recent, leaderboard, feed } = data;
  const rows = leaderboard.leaderboard;

  return (
    <div className="pitch-bg min-h-screen px-6 pb-[calc(1.5rem_+_env(safe-area-inset-bottom,0px))] pt-[calc(1.5rem_+_env(safe-area-inset-top,0px))]">
      <header className="mb-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <span className="text-3xl">🏆</span>
          <span className="text-2xl font-black">Nations League <span className="text-oranje-500">Pool</span></span>
        </Link>
        <div className="flex items-center gap-4">
          {live.length > 0 && <LiveDot />}
          <span className="text-2xl font-bold tabular-nums text-emerald-50/70">
            {clock.toLocaleTimeString('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* live + matches column (2/3) */}
        <div className="space-y-4 lg:col-span-2">
          {live.length === 0 && (
            <div className="card p-10 text-center text-emerald-50/50">
              <div className="mb-2 text-4xl">😴</div>
              {t('tv.noLive')}
            </div>
          )}
          {live.map((m) => (
            <div key={m.id} className="card border-red-500/30 p-6">
              <div className="mb-3 flex items-center justify-between text-sm text-emerald-50/50">
                <span>{m.stage === 'league' ? t('tv.group', { g: m.group_name }) : t('tv.knockout')} </span>
                <span className="flex items-center gap-2"><LiveDot /> <b className="text-red-400">{m.minute}</b></span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex flex-1 items-center justify-end gap-4 text-right">
                  <span className="text-3xl font-black">{tn(m.home_code, m.home_name)}</span>
                  <span className="text-6xl">{m.home_flag}</span>
                </div>
                <div className="mx-8 text-6xl font-black tabular-nums text-red-400">
                  {m.home_score}–{m.away_score}
                </div>
                <div className="flex flex-1 items-center gap-4">
                  <span className="text-6xl">{m.away_flag}</span>
                  <span className="text-3xl font-black">{tn(m.away_code, m.away_name)}</span>
                </div>
              </div>
              {m.goals?.length > 0 && (
                <div className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm text-emerald-50/60">
                  {m.goals.map((g, i) => (
                    <span key={i}>⚽ {g.minute} {g.player_name} <span className="text-emerald-50/40">({g.team_code})</span></span>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="card p-4">
              <h2 className="mb-2 font-bold text-emerald-50/60">{t('tv.upcoming')}</h2>
              {upcoming.length === 0 && <p className="text-sm text-emerald-50/40">{t('tv.noScheduled')}</p>}
              {upcoming.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-1.5 text-lg">
                  <span>{m.home_flag} <b>{m.home_code}</b> – <b>{m.away_code}</b> {m.away_flag}</span>
                  <span className="text-sm text-emerald-50/50">{fmtDay(m.kickoff_utc)} {fmtTime(m.kickoff_utc)}</span>
                </div>
              ))}
            </div>
            <div className="card p-4">
              <h2 className="mb-2 font-bold text-emerald-50/60">{t('tv.finished')}</h2>
              {recent.length === 0 && <p className="text-sm text-emerald-50/40">{t('tv.noResults')}</p>}
              {recent.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-1.5 text-lg">
                  <span>{m.home_flag} <b>{m.home_code}</b> – <b>{m.away_code}</b> {m.away_flag}</span>
                  <span className="font-black tabular-nums">{m.home_score}–{m.away_score}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* leaderboard + combined live feed column */}
        <div className="space-y-6 self-start">
          <div className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 text-xl font-black">
              🏆 {t('tv.board')} {leaderboard.is_live && <LiveDot />}
            </h2>
            <div className="space-y-2">
              {rows.slice(0, 12).map((r) => (
                <div key={r.user_id} className={`flex items-center gap-3 rounded-xl p-2 ${r.rank === 1 ? 'bg-oranje-500/15' : ''}`}>
                  <span className="w-8 text-center text-xl font-black text-emerald-50/60">
                    {['🥇', '🥈', '🥉'][r.rank - 1] || r.rank}
                  </span>
                  <span className="text-2xl">{r.avatar}</span>
                  <span className="flex-1 truncate text-lg font-semibold">{r.display_name}</span>
                  {leaderboard.is_live && r.live_points > 0 && (
                    <span className="chip animate-pulse-live bg-red-500/15 text-red-300">+{fmtPoints(r.live_points)}</span>
                  )}
                  <span className="text-xl font-black tabular-nums">{fmtPoints(leaderboard.is_live ? r.live_total : r.total_points)}</span>
                </div>
              ))}
            </div>
          </div>
          {feed.length > 0 && <LiveFeed t={t} feed={feed} multi={new Set(feed.map((l) => l.match.id)).size > 1} />}
        </div>
      </div>

      {/* faster goal detection on the big screen */}
      <GoalFlash intervalMs={12_000} />
    </div>
  );
}

function LiveFeed({ t, feed, multi }) {
  return (
    <div className="card p-5" data-testid="tv-feed">
      <h2 className="mb-3 flex items-center gap-2 text-xl font-black">📣 {t('tv.feed')}</h2>
      <div className="divide-y divide-white/5">
        {feed.map((l) => {
          const m = l.match;
          const flag = l.side === 'home' ? m.home_flag : l.side === 'away' ? m.away_flag : null;
          const headline = HEADLINE_KINDS.has(l.kind);
          return (
            <div key={l.key} className={`flex items-start gap-3 py-2 ${headline ? 'py-3' : ''}`} data-testid="tv-feed-line">
              <span className="w-9 shrink-0 text-center text-2xl leading-7" title={flag ? '' : `${m.home_code}–${m.away_code}`}>
                {flag || <span className="text-sm leading-7">{m.home_flag}{m.away_flag}</span>}
              </span>
              <span className={`w-12 shrink-0 font-black tabular-nums leading-7 text-oranje-300 ${headline ? 'text-lg' : ''}`}>{l.minute || ''}</span>
              <span className={`flex-1 leading-7 ${headline ? 'font-semibold text-emerald-50' : 'text-emerald-50/85'}`}>
                {!headline && <Badge t={t} kind={l.kind} />}
                {l.text}
                {multi && <span className="ml-2 whitespace-nowrap text-xs text-emerald-50/35">{m.home_code}–{m.away_code}</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

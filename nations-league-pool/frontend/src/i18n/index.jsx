import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { STRINGS, TEAM_NAMES, ACHIEVEMENTS_I18N, LANGUAGES } from './translations';
import { setFormatLocale } from '../utils/format';

const LangContext = createContext(null);
const STORAGE_KEY = 'nlpool_lang';

export function initialLanguage() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && STRINGS[stored]) return stored;
  return 'nl';
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const l = initialLanguage();
    setFormatLocale(localeFor(l));
    return l;
  });

  const setLang = useCallback((next) => {
    if (!STRINGS[next]) return;
    localStorage.setItem(STORAGE_KEY, next);
    setFormatLocale(localeFor(next));
    setLangState(next);
  }, []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

function localeFor(lang) {
  return LANGUAGES.find((l) => l.code === lang)?.locale || 'nl-NL';
}

/**
 * The translation hook. Returns:
 *  t(key, vars)      — translated string with {var} interpolation
 *  tn(code, fallback)— localized team name by code
 *  ach(key)          — [name, description] for an achievement, or null (use server text)
 *  lang / setLang
 */
export function useT() {
  const { lang, setLang } = useContext(LangContext);

  const t = useCallback((key, vars) => {
    let s = STRINGS[lang]?.[key] ?? STRINGS.nl[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  }, [lang]);

  const tn = useCallback((code, fallback) => {
    return (code && TEAM_NAMES[lang]?.[code]) || fallback || code || '';
  }, [lang]);

  const ach = useCallback((key) => ACHIEVEMENTS_I18N[lang]?.[key] || null, [lang]);

  return { t, tn, ach, lang, setLang };
}

/** Localized section heading for a match in the list. */
export function roundLabelT(t, m) {
  if (m.stage === 'league') return t('round.league', { md: m.matchday });
  if (m.stage === 'quarterfinal') return m.matchday === 7 ? t('round.qf1') : t('round.qf2');
  return t('round.finals');
}

const STAGE_MULT = { quarterfinal: '×1,5', semifinal: '×2', third_place: '×2', final: '×2,5' };

/** Localized context line on a match card. */
export function matchContextT(t, m) {
  if (m.stage === 'league') return t('match.context', { group: m.group_name, md: m.matchday });
  const label = t(`stage.${m.stage}`);
  const mult = STAGE_MULT[m.stage];
  return mult ? `🏆 ${label} · ${t('match.pointsX', { mult })}` : t('match.knockout');
}

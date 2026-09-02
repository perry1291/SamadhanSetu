/**
 * Application-wide language provider.
 *
 * Components never branch on the current language. They call `t("group.key")`
 * and the locale resource files hold every string, so adding a language requires
 * no component changes.
 *
 * The preference is a non-sensitive UI setting stored in `localStorage`. It is
 * deliberately not part of any authentication or session state.
 *
 * SSR note: the first render uses DEFAULT_LOCALE on both server and client so
 * the markup matches, then an effect applies the stored preference. Reading
 * localStorage during render would cause a hydration mismatch instead.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { LanguageContext, type LanguageContextValue } from "./context";
import { DEFAULT_LOCALE, isLocale, LOCALES, translate, type Locale } from "./translations";

const STORAGE_KEY = "samadhansetu.locale";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  // Apply the stored preference after mount (mount-only by design).
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage can throw in private-browsing modes; the default locale stands.
    }
    if (isLocale(stored)) setLocaleState(stored);
  }, []);

  // Keep the document language in sync for screen readers and hyphenation.
  useEffect(() => {
    document.documentElement.lang = LOCALES[locale].htmlLang;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Persistence is best-effort; the in-memory value still applies.
    }
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, values) => translate(locale, key, values),
    }),
    [locale, setLocale],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

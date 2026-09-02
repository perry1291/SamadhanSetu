/**
 * Language context definition, kept apart from the provider component so that
 * neither module mixes component and non-component exports (react-refresh).
 */
import { createContext } from "react";

import type { Locale, TranslationKey, TranslationValues } from "./translations";

export interface LanguageContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: TranslationKey, values?: TranslationValues) => string;
}

export const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

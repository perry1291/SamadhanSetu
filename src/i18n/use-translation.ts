/**
 * The single hook components use for text. Keeps translation lookups out of
 * component bodies and prevents inline language conditionals.
 */
import { useContext } from "react";

import { LanguageContext, type LanguageContextValue } from "./context";

export function useTranslation(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useTranslation must be used inside <LanguageProvider>.");
  }
  return context;
}

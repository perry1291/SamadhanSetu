/**
 * Language selector for the government header.
 *
 * Renders a native <select>: it is keyboard accessible by default, announces
 * correctly to screen readers, and on mobile opens the platform picker, which is
 * easier for citizens with limited digital literacy than a custom dropdown.
 *
 * Option labels are always shown in their own script (English, हिन्दी) so a
 * citizen can find their language without first being able to read the current one.
 */
import { Globe } from "lucide-react";

import { useTranslation } from "@/i18n/use-translation";
import { LOCALE_CODES, LOCALES, isLocale } from "@/i18n/translations";
import { cn } from "@/lib/utils";

export function LanguageSelector({ className }: { className?: string }) {
  const { locale, setLocale, t } = useTranslation();

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Globe className="size-3.5 shrink-0 opacity-90" aria-hidden />
      <label htmlFor="language-selector" className="whitespace-nowrap opacity-90">
        {t("language.label")}:
      </label>
      <select
        id="language-selector"
        aria-label={t("language.selectorAria")}
        value={locale}
        onChange={(event) => {
          const next = event.target.value;
          if (isLocale(next)) setLocale(next);
        }}
        className={
          "cursor-pointer rounded-sm border border-primary-foreground/30 bg-primary-dark " +
          "px-1.5 py-0.5 font-medium text-primary-foreground " +
          "focus-visible:ring-2 focus-visible:ring-saffron focus-visible:outline-none"
        }
      >
        {LOCALE_CODES.map((code) => (
          <option key={code} value={code} className="text-foreground">
            {LOCALES[code].nativeLabel}
          </option>
        ))}
      </select>
    </div>
  );
}

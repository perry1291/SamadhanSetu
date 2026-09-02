/**
 * Locale registry and key typing.
 *
 * Adding a language is two steps and touches no component:
 *   1. create `locales/<code>.ts` typed as `TranslationResource`
 *   2. add it to `LOCALES` below
 */
import en, { type TranslationResource } from "./locales/en";
import hi from "./locales/hi";

export const LOCALES = {
  en: { label: "English", nativeLabel: "English", resource: en, htmlLang: "en" },
  hi: { label: "Hindi", nativeLabel: "हिन्दी", resource: hi, htmlLang: "hi" },
} satisfies Record<
  string,
  { label: string; nativeLabel: string; resource: TranslationResource; htmlLang: string }
>;

export type Locale = keyof typeof LOCALES;

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_CODES = Object.keys(LOCALES) as Locale[];

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && Object.hasOwn(LOCALES, value);
}

/**
 * Dot-separated paths to every leaf string, e.g. `"register.fullName"`.
 * Gives autocomplete on `t()` and turns typos into compile errors.
 */
export type TranslationKey = {
  [Group in keyof TranslationResource & string]: `${Group}.${keyof TranslationResource[Group] &
    string}`;
}[keyof TranslationResource & string];

export type TranslationValues = Record<string, string | number>;

/**
 * Resolves a key against a locale, falling back to English when a locale is
 * incomplete, then to the key itself so the UI degrades to something inspectable
 * rather than blank.
 */
export function translate(locale: Locale, key: TranslationKey, values?: TranslationValues): string {
  const [group, entry] = key.split(".") as [keyof TranslationResource & string, string];

  const localeGroup = LOCALES[locale].resource[group] as Record<string, string> | undefined;
  const fallbackGroup = LOCALES[DEFAULT_LOCALE].resource[group] as
    Record<string, string> | undefined;

  const template = localeGroup?.[entry] ?? fallbackGroup?.[entry];
  if (template === undefined) return key;
  if (values === undefined) return template;

  return template.replace(/\{(\w+)\}/g, (match, token: string) => {
    const replacement = values[token];
    return replacement === undefined ? match : String(replacement);
  });
}

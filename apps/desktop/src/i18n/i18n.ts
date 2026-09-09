/**
 * The string catalog.
 *
 * Keys are the English source string itself. That buys three things at once: a
 * component reads on the page exactly as it reads in the file, a missing
 * translation falls back to English with no fallback machinery, and the same
 * sentence written in two files collapses to one entry for free.
 *
 * Deliberately not i18next. There are no namespaces, no plural categories the
 * two locales disagree on, and no lazy loading worth an async boundary — a
 * `Record<string, string>` and one lookup is the whole requirement.
 *
 * The catalog is a module-level mutable, not React state, because the strings
 * are also read from plain data files (the Rosetta table, the milestones) that
 * no hook can reach. Switching locale notifies the subscribers, and the window
 * re-keys its tree on the result.
 */
import { ko } from "./ko/index.ts";

export interface Locale {
  readonly id: string;
  /** Endonym: a language picker in a language you cannot read is useless. */
  readonly name: string;
}

export const LOCALES: readonly Locale[] = [
  { id: "en", name: "English" },
  { id: "ko", name: "한국어" },
];

type Catalog = Record<string, string>;

/** English is the empty catalog: every key already is its English string. */
const CATALOGS = { en: {}, ko } satisfies Record<string, Catalog>;

/**
 * The locales that actually have a catalog. `LOCALES` above is the display
 * side of the same pair; this is the side a lookup can be trusted against, so
 * `CATALOGS[active]` needs no fallback for a key that cannot exist.
 */
type LocaleId = keyof typeof CATALOGS;

/** Narrow a tag from outside — a saved choice, `navigator.language` — to one. */
function known(id: string): LocaleId | undefined {
  return id in CATALOGS ? (id as LocaleId) : undefined;
}

let active: LocaleId = "en";
let catalog: Catalog = CATALOGS.en;
const listeners = new Set<() => void>();

/**
 * Translate. `vars` fills `{name}` placeholders, so a sentence stays one
 * catalog entry instead of being concatenated out of fragments — word order
 * differs between English and Korean and concatenation cannot survive that.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const line = catalog[key] ?? key;
  if (!vars) return line;
  return line.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

export function currentLocale(): string {
  return active;
}

export function applyLocale(id: string): void {
  active = known(id) ?? "en";
  catalog = CATALOGS[active];
  if (typeof document !== "undefined") document.documentElement.lang = active;
  try {
    localStorage.setItem("ukemi:locale", active);
  } catch {
    // The choice just will not persist; not worth interrupting the user.
  }
  for (const listener of listeners) listener();
}

/** The locale to start in: the last choice, else the system's, else English. */
export function initialLocale(): string {
  try {
    const saved = localStorage.getItem("ukemi:locale");
    if (saved && known(saved)) return saved;
  } catch {
    // No storage: fall through to the system language.
  }
  const tag = typeof navigator === "undefined" ? "" : navigator.language;
  return known(tag.split("-")[0] ?? "") ?? "en";
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * A translated sentence split around one `{name}` placeholder, so JSX can put
 * a styled element (a revset in mono, a branch name) where the placeholder is
 * without the sentence being concatenated out of two half-keys. The halves land
 * in whatever order the translation puts them.
 */
export function tParts(key: string, name: string): readonly [string, string] {
  const [before = "", after = ""] = t(key).split(`{${name}}`);
  return [before, after];
}

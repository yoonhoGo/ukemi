/**
 * The user's font choice, laid over whichever theme is active.
 *
 * A theme names its faces through `--u-font` and `--u-font-mono`; the user's
 * pick lands as an inline custom property on the root element, which beats any
 * stylesheet rule without touching the theme itself. Clearing a field removes
 * the property, and the theme's own face is back — so "theme default" is the
 * absence of an override rather than a value of its own.
 *
 * The typed name goes in front of a short generic tail rather than the theme's
 * full chain: SUIT still catches Hangul when the chosen Latin face has none,
 * and a misspelt name degrades to the generic family instead of a broken row.
 */
export interface Fonts {
  readonly ui: string;
  readonly mono: string;
}

const KEY = "ukemi:fonts";

export const NO_FONTS: Fonts = { ui: "", mono: "" };

/** Faces worth suggesting: what macOS ships, plus the usual Korean and coding installs. */
export const UI_FONT_SUGGESTIONS = [
  "SUIT",
  "Pretendard",
  "Helvetica Neue",
  "Avenir Next",
  "Iowan Old Style",
  "Georgia",
  "Apple SD Gothic Neo",
];
export const MONO_FONT_SUGGESTIONS = [
  "SF Mono",
  "Menlo",
  "Monaco",
  "JetBrains Mono",
  "Fira Code",
  "D2Coding",
];

export function applyFonts(fonts: Fonts): void {
  const style = document.documentElement.style;
  const set = (prop: string, face: string, tail: string) =>
    face.trim() ? style.setProperty(prop, `"${face.trim()}", ${tail}`) : style.removeProperty(prop);
  set("--u-font", fonts.ui, "SUIT, sans-serif");
  set("--u-font-mono", fonts.mono, "monospace");
  try {
    localStorage.setItem(KEY, JSON.stringify(fonts));
  } catch {
    // The choice just will not persist; not worth interrupting the user.
  }
}

export function rememberedFonts(): Fonts {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Fonts>;
    return {
      ui: typeof stored.ui === "string" ? stored.ui : "",
      mono: typeof stored.mono === "string" ? stored.mono : "",
    };
  } catch {
    return NO_FONTS;
  }
}

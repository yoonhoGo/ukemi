/**
 * The built-in theme registry.
 *
 * Built-in themes load through the same path an external one would — a
 * stylesheet plus a `data-theme` value, nothing privileged. That is deliberate:
 * it is the only way to know the class contract is actually sufficient rather
 * than merely documented (design §8 principle ③).
 *
 * Fonts and images must be bundled with a theme; the window's CSP blocks
 * remote `url()` loads, so a theme cannot phone home.
 */
import "./ink.css";

export interface Theme {
  readonly id: string;
  readonly name: string;
  readonly note: string;
}

/** Contract version these themes are written against. */
export const CONTRACT_VERSION = 1;

export const THEMES: readonly Theme[] = [
  {
    id: "hig",
    name: "System",
    note: "macOS standard. The contract's own defaults, with no overrides.",
  },
  {
    id: "ink",
    name: "Ink & Paper",
    note: "Warm paper, ink rules, one vermilion. Serif descriptions.",
  },
];

/** The theme currently applied, read back from the root element. */
export function currentTheme(): string {
  return document.documentElement.getAttribute("data-theme") ?? "hig";
}

/**
 * Apply a theme by stamping the root element.
 *
 * `hig` stamps nothing, so it resolves to the bare `:root` defaults in
 * `contract.css` — which keeps the default path and the theme path identical
 * instead of making the default a special case.
 */
export function applyTheme(id: string): void {
  const root = document.documentElement;
  if (id === "hig") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", id);
  try {
    localStorage.setItem("ukemi:theme", id);
  } catch {
    // The theme just will not persist; not worth interrupting the user.
  }
}

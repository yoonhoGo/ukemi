/**
 * What the sidebar remembers between launches: which sections are folded, and
 * the order the saved-revset rows are in.
 *
 * One `localStorage` key, the user's and not the repository's — a folded
 * section is a habit, not a fact about a repo — and module-level like the
 * onboarding progress so the rows and the ⌘-digit map read one value.
 */
import { useSyncExternalStore } from "react";

const KEY = "ukemi:sidebar";

export interface SidebarState {
  readonly collapsed: readonly string[];
  /** Row ids (a built-in label or an alias name) in the order the user left them. */
  readonly revsetOrder: readonly string[];
}

const EMPTY: SidebarState = { collapsed: [], revsetOrder: [] };
const isId = (value: unknown): value is string => typeof value === "string";

function load(): SidebarState {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<SidebarState>;
    return {
      collapsed: Array.isArray(parsed.collapsed) ? parsed.collapsed.filter(isId) : [],
      revsetOrder: Array.isArray(parsed.revsetOrder) ? parsed.revsetOrder.filter(isId) : [],
    };
  } catch {
    return EMPTY;
  }
}

let current: SidebarState = load();
const listeners = new Set<() => void>();

function commit(next: SidebarState): void {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Blocked storage: the session still behaves, only the memory is lost.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSidebarState(): SidebarState {
  return useSyncExternalStore(subscribe, () => current);
}

export function setCollapsed(section: string, collapsed: boolean): void {
  const rest = current.collapsed.filter((id) => id !== section);
  commit({ ...current, collapsed: collapsed ? [...rest, section] : rest });
}

export function setRevsetOrder(revsetOrder: readonly string[]): void {
  commit({ ...current, revsetOrder });
}

/**
 * Rows in the remembered order; anything the order does not know — a new
 * built-in, an alias saved since — keeps its natural place after them.
 */
export function orderRows<T>(
  rows: readonly T[],
  idOf: (row: T) => string,
  order: readonly string[],
): T[] {
  const rank = new Map(order.map((id, index) => [id, index]));
  const known = rows.filter((row) => rank.has(idOf(row)));
  known.sort((a, b) => rank.get(idOf(a))! - rank.get(idOf(b))!);
  return [...known, ...rows.filter((row) => !rank.has(idOf(row)))];
}

/** `from` takes `to`'s place; the rest slide to make room. Unknown ids are a no-op. */
export function reorder(ids: readonly string[], from: string, to: string): string[] {
  const target = ids.indexOf(to);
  if (target < 0 || !ids.includes(from) || from === to) return [...ids];
  const without = ids.filter((id) => id !== from);
  without.splice(target, 0, from);
  return without;
}

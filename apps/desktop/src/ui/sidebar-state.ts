/**
 * What the sidebar remembers between launches: which sections are folded, and
 * the order the saved-revset rows are in.
 *
 * One `localStorage` key, the user's and not the repository's — a folded
 * section is a habit, not a fact about a repo — and module-level like the
 * onboarding progress so the rows and the ⌘-digit map read one value.
 */
import { useSyncExternalStore } from "react";
import type { Bookmark } from "@ukemi/domain";

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

/** `v1.10` after `v1.9`: numeric runs compare as numbers, case is ignored. */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/** Newest version first — a tag's name is its place in time, so the name sorts. */
export function sortTags<T extends { readonly name: string }>(tags: readonly T[]): T[] {
  return [...tags].sort((a, b) => naturalCompare(b.name, a.name));
}

/** Trunk pinned first; the rest have no order in their names, so alphabetical. */
export function sortBookmarks<T extends { readonly name: string }>(
  bookmarks: readonly T[],
  trunk: string | undefined,
): T[] {
  return [...bookmarks].sort((a, b) => {
    if (a.name === trunk) return -1;
    if (b.name === trunk) return 1;
    return naturalCompare(a.name, b.name);
  });
}

/**
 * Local rows only; remote-tracking rows fold into their local row's counts.
 *
 * The `git` remote of a colocated repo is not one of those: jj tracks it by
 * construction, so folding its counts in would give every bookmark a ↑0 and
 * hide the one fact worth seeing — that nobody has pushed the name anywhere.
 */
export function localBookmarks(bookmarks: readonly Bookmark[]): Bookmark[] {
  const remotes = bookmarks.filter(
    (bookmark) => bookmark.remote !== undefined && bookmark.remote !== "git",
  );
  return bookmarks
    .filter((bookmark) => bookmark.remote === undefined)
    .map((local) => {
      const tracked = remotes.find(
        (remote) => remote.name === local.name && remote.ahead !== undefined,
      );
      return tracked ? { ...local, ahead: tracked.ahead, behind: tracked.behind } : local;
    });
}

/**
 * The bookmarks no remote has yet, which `jj git push` on its own will not
 * send: its default set is the *tracking* bookmarks, so a name that has never
 * been pushed comes back as "Refusing to create new remote bookmark" — a
 * warning on stderr that the window never shows, under a "Nothing changed".
 * Naming them with `--bookmark` is what pushes them, and doing that also
 * tracks them, so a bookmark appears here exactly once in its life.
 */
export function unpushedBookmarks(bookmarks: readonly Bookmark[]): string[] {
  return localBookmarks(bookmarks)
    .filter((bookmark) => bookmark.target !== undefined && bookmark.ahead === undefined)
    .map((bookmark) => bookmark.name);
}

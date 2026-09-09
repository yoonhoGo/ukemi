import type { Bookmark, RevsetAlias, RevsetFunction, Workspace } from "@ukemi/domain";
import { bookmarkRevset } from "@ukemi/domain";

/**
 * The revset half of the ⌘G / ⌘K sheet: what can go into the field, ranked.
 *
 * Pure, and deliberately not in `domain`: the rows are a UI shape (a badge, a
 * name, a line of detail) rather than anything the port knows about. The
 * scoring lives here beside them because `Lookup.tsx` should be able to be read
 * as layout.
 */

/** Which list a row came from. Drives its badge, and breaks ranking ties. */
export type RevsetRowKind = "saved" | "bookmark" | "workspace" | "function";

export interface RevsetRow {
  readonly kind: RevsetRowKind;
  /** What the row is called. Matched against first, and shown first. */
  readonly name: string;
  /** What goes into the field when this row is chosen. */
  readonly insert: string;
  /**
   * The row's right-hand line: the expression a saved name stands for, the
   * change a workspace sits on, or jj's own sentence about a function. Data,
   * never a translated label — the badge carries the translated part.
   */
  readonly detail: string;
}

/**
 * What each kind of row is called in its badge.
 *
 * Catalogue keys, translated where the row is drawn. `i18n.test.ts` checks this
 * table directly, because it is reached by passing a field rather than a
 * literal — which is exactly what that test's scan of the source cannot see.
 */
export const KIND_LABELS: Record<RevsetRowKind, string> = {
  saved: "saved",
  bookmark: "bookmark",
  workspace: "workspace",
  function: "function",
};

/** Your own things first, jj's vocabulary last. Also the tie-break order. */
const KIND_ORDER: readonly RevsetRowKind[] = ["saved", "bookmark", "workspace", "function"];

export function revsetRows(sources: {
  readonly aliases?: readonly RevsetAlias[] | undefined;
  readonly bookmarks?: readonly Bookmark[] | undefined;
  readonly workspaces?: readonly Workspace[] | undefined;
  readonly functions?: readonly RevsetFunction[] | undefined;
}): RevsetRow[] {
  const rows: RevsetRow[] = [];

  for (const alias of sources.aliases ?? []) {
    // The name, not the expansion: that is the point of storing these as jj
    // aliases, and it keeps the field short.
    rows.push({ kind: "saved", name: alias.name, insert: alias.name, detail: alias.revset });
  }

  // Local rows only. A remote-tracking row carries the same name, and two rows
  // that insert the same text is a list that looks broken.
  for (const bookmark of sources.bookmarks ?? []) {
    if (bookmark.remote !== undefined) continue;
    rows.push({
      kind: "bookmark",
      name: bookmark.name,
      insert: bookmarkRevset(bookmark.name),
      detail: bookmark.target ?? "",
    });
  }

  // No detail: what a workspace row means *is* the change it inserts, and the
  // row already shows that in its middle column.
  for (const workspace of sources.workspaces ?? []) {
    rows.push({
      kind: "workspace",
      name: workspace.name,
      insert: workspace.changeId,
      detail: "",
    });
  }

  for (const fn of sources.functions ?? []) {
    // The caret lands inside the parens for a function that takes something,
    // and after them for one that does not — so `mine()` is finished and
    // `bookmarks(` is waiting, which is the true difference between them.
    rows.push({
      kind: "function",
      name: `${fn.name}(${fn.params})`,
      insert: fn.params.length === 0 ? `${fn.name}()` : `${fn.name}(`,
      detail: fn.about,
    });
  }

  return rows;
}

/** Whitespace-separated words, lowercased. Same idea as the Rosetta lookup. */
function terms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Rows matching `query`, best first.
 *
 * Every term has to hit something — a filter that keeps a row because one word
 * out of three matched is a filter that never narrows. Within that, a term on
 * the front of the name beats one in the middle, which beats one in the
 * detail: `boo` should offer `bookmarks(…)` before `remote_bookmarks(…)`, and
 * both before whatever function merely mentions bookmarks in its sentence.
 *
 * An empty query is the reference list, in `KIND_ORDER`: your saved revsets,
 * your bookmarks, your workspaces, and then jj's functions in jj's own
 * documentation order. ponytail: that order is thematic, not by how often a
 * function is wanted. Ranking the tail by use would need usage data the app
 * does not keep.
 */
export function rankRevsetRows(
  rows: readonly RevsetRow[],
  query: string,
  limit: number,
): RevsetRow[] {
  const words = terms(query);
  const byKind = (a: RevsetRow, b: RevsetRow) =>
    KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);

  if (words.length === 0) return [...rows].sort(byKind).slice(0, limit);

  return rows
    .map((row, index) => {
      const name = row.name.toLowerCase();
      const detail = row.detail.toLowerCase();
      let score = 0;
      for (const word of words) {
        const hit = name.startsWith(word) ? 3 : name.includes(word) ? 2 : detail.includes(word) ? 1 : 0;
        if (hit === 0) return { row, index, score: 0 };
        score += hit;
      }
      return { row, index, score };
    })
    .filter((scored) => scored.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        KIND_ORDER.indexOf(a.row.kind) - KIND_ORDER.indexOf(b.row.kind) ||
        a.index - b.index,
    )
    .slice(0, limit)
    .map((scored) => scored.row);
}

/**
 * `draft` with `insert` put in.
 *
 * One rule: **the palette completes the word you are on.** A trailing run of
 * name characters is what gets replaced, so `mine() & boo` becomes
 * `mine() & bookmarks(`. When there is no word to complete the text is
 * appended after a space, and the operator between them is yours to type —
 * guessing `&` over `|` there would be the palette deciding what you meant.
 *
 * ponytail: the *trailing* word, not the one under the caret. Completing in
 * the middle of an expression rewrites the end instead; the upgrade is to pass
 * the field's selectionStart in, once editing mid-expression is a real habit.
 */
export function insertIntoDraft(draft: string, insert: string): string {
  const word = /[A-Za-z0-9_-]+$/.exec(draft);
  if (word) return draft.slice(0, word.index) + insert;
  if (draft.length === 0 || /[\s(~:]$/.test(draft)) return draft + insert;
  return `${draft} ${insert}`;
}

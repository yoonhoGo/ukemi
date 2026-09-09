/**
 * Revset string assembly.
 *
 * Pure string work, kept out of the adapter so the UI can build and show a
 * revset (the ⌘L field echoes it verbatim) without touching a process.
 */

/**
 * Quote a value for use as a jj revset/fileset string literal.
 *
 * Bookmark names and paths reach here straight from user input and from remote
 * refs, so this is a trust boundary: an unquoted `main | all()` in a bookmark
 * name would otherwise widen the revset, and a quote in a filename would break
 * the expression. jj string literals are double-quoted with backslash escapes.
 */
export function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** The revset the window opens on: recent work plus everything it descends from. */
export const DEFAULT_REVSET = "present(@) | ancestors(bookmarks() | @, 12)";

/** Revisions with a conflict anywhere in the visible history. */
export const CONFLICTS_REVSET = "conflicts()";

/** Your own changes that no remote has yet. */
export const UNPUSHED_REVSET = "mine() & ~::remote_bookmarks()";

/** Cap a revset so a huge repo cannot stall the first paint. */
export function withLimit(revset: string, limit: number): string {
  return `latest(${revset}, ${limit})`;
}

/** The revset for one bookmark by name, safely quoted. */
export function bookmarkRevset(name: string): string {
  return `bookmarks(exact:${quote(name)})`;
}

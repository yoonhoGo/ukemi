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

/**
 * The revset the window opens on — jj's own default `revsets.log`, verbatim.
 *
 * Matching the CLI is the point: the window shows what `jj log` shows, so the
 * app teaches the tool rather than inventing a second idea of "recent". An
 * earlier attempt at `ancestors(bookmarks() | @, 12)` looked reasonable and was
 * wrong: it silently hid the tip of any stack that had no bookmark yet, which
 * is most of them. `immutable_heads()..` is "everything you can still change",
 * which is the actual question.
 */
export const DEFAULT_REVSET =
  "present(@) | ancestors(immutable_heads().., 2) | present(trunk())";

/** Revisions carrying a conflict. */
export const CONFLICTS_REVSET = "conflicts()";

/** Your own mutable changes that no remote bookmark contains yet. */
export const UNPUSHED_REVSET = "mine() & mutable() & ~::remote_bookmarks()";

/** Cap a revset so a huge repo cannot stall the first paint. */
export function withLimit(revset: string, limit: number): string {
  return `latest(${revset}, ${limit})`;
}

/** The revset for one bookmark by name, safely quoted. */
export function bookmarkRevset(name: string): string {
  return `bookmarks(exact:${quote(name)})`;
}

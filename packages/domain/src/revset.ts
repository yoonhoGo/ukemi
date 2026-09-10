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

/** Every revision a bookmark points at, local and remote. */
export const BOOKMARKS_REVSET = "bookmarks() | remote_bookmarks()";

/** Your own mutable changes with nothing in them — the abandon pile. */
export const EMPTY_REVSET = "empty() & mutable() & mine()";

/** The whole repository. `withLimit` still caps what the window paints. */
export const ALL_REVSET = "all()";

/**
 * What a Git client draws by default: everything a bookmark, a remote, a tag
 * or the working copy can reach. Git has no unnamed head, so that *is* its
 * whole history; jj's unnamed mutable stacks are added back or the view would
 * hide most of what you are working on.
 */
export const REACHABLE_REVSET =
  "::(bookmarks() | remote_bookmarks() | tags() | @) | mutable()";

/** Revisions that touched one path — the file's history, safely quoted. */
export function fileHistoryRevset(path: string): string {
  return `files(${quote(path)})`;
}

/**
 * A plain-text search, the way a Git client's search box reads: the message,
 * the author, or a name jj can resolve (a bookmark, a change id prefix).
 * `present` turns "no such revision" into an empty set instead of an error.
 */
export function searchRevset(text: string): string {
  const pattern = `substring-i:${quote(text)}`;
  return `description(${pattern}) | author(${pattern}) | present(${quote(text)})`;
}

/**
 * One revision, the mutable history under it, and trunk for orientation.
 *
 * The board's "show this change" and the working-copy preset ask the same
 * question, so the formula lives here once. `rev` is a revset expression, not a
 * name — `@` and a change id both belong, and neither can be quoted.
 */
export function stackRevset(rev: string): string {
  return `${rev} | (::${rev} & mutable()) | present(trunk())`;
}

/** Cap a revset so a huge repo cannot stall the first paint. */
export function withLimit(revset: string, limit: number): string {
  return `latest(${revset}, ${limit})`;
}

/** The revset for one bookmark by name, safely quoted. */
export function bookmarkRevset(name: string): string {
  return `bookmarks(exact:${quote(name)})`;
}

/** The revset for one tag by name, safely quoted. */
export function tagRevset(name: string): string {
  return `tags(exact:${quote(name)})`;
}

/** Which revisions a rebase moves. Mirrors `jj rebase`'s `-r` / `-s` / `-b`. */
export type RebaseMode = "revision" | "source" | "branch";

/**
 * The revisions a rebase in `mode` would move.
 *
 * Used to count and ghost the affected rows before anything runs, so the drag
 * preview states a fact rather than a guess. The `branch` formula is jj's own
 * documented equivalence — `-b X` behaves as `-s roots(onto..X)` — and
 * `contract.test.ts` re-checks it by running the real rebase, because a wrong
 * set here would mislabel how much history is about to move.
 */
export function rebaseSetRevset(mode: RebaseMode, rev: string, onto: string): string {
  switch (mode) {
    case "revision":
      return rev;
    case "source":
      return `${rev}::`;
    case "branch":
      return `roots(${onto}..${rev})::`;
  }
}

/**
 * Whether `name` is safe to save as a revset alias.
 *
 * A trust boundary, like `quote()` above, and for the same reason in reverse:
 * the alias name goes into a config key *and* comes back out as a bare symbol
 * inside a revset expression, where it cannot be quoted. jj itself validates
 * neither — `jj config set 'revset-aliases."a | all()"' none()` is accepted and
 * would widen every revset that named it — so the narrowing happens here.
 *
 * A plain symbol only: a letter, then letters, digits, `_` or `-`. That is
 * narrower than jj's own grammar (which allows a quoted name, and a `name(x)`
 * function alias) and deliberately so — the app only offers what it can put in
 * a sidebar row and click.
 *
 * ponytail: does not reject a name that shadows a bookmark. `main` as an alias
 * would quietly outrank the bookmark `main` in every revset; the fix is to
 * check the loaded bookmark list at save time, once that has bitten someone.
 */
export function isAliasName(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(name);
}

import type {
  Bookmark,
  ChangeId,
  FileChange,
  GitInfo,
  Operation,
  PullRequest,
  OperationId,
  Revision,
  Workspace,
} from "./types.ts";
import type { RebaseMode } from "./revset.ts";

/**
 * Pins a read to one point in time.
 *
 * Every read goes through `jj --ignore-working-copy --at-op=<id>`: the flags
 * remove the snapshot side effect and the race against a concurrent CLI, and
 * they freeze what the window is looking at. Omitting `atOp` means "whatever
 * the repo head is now" — correct for the first load, wrong for anything the
 * operation scrubber drives, which always passes the op it is parked on.
 */
export interface ReadOptions {
  readonly atOp?: OperationId | undefined;
}

/** Result of a write: the operation it created, so the UI can advance its pin. */
export interface WriteResult {
  readonly opId: OperationId;
  /** jj's own stderr summary of what it did, when it printed one. */
  readonly message?: string | undefined;
}

/**
 * One file's desired content on the "kept" side of a hunk-level operation.
 *
 * `revert` restores the file from the pre-change side without shipping its
 * bytes, which is how a binary file or a wholly deselected file is expressed.
 */
export type PlanFile =
  | { readonly path: string; readonly op: "write"; readonly content: string }
  | { readonly path: string; readonly op: "delete" }
  | { readonly path: string; readonly op: "revert" };

/** A conflicted file, as `jj resolve --list` reports it. */
export interface ConflictedFile {
  readonly path: string;
  /** jj's own wording, e.g. "2-sided conflict". */
  readonly description: string;
  /** Number of sides, parsed from the description when it says. */
  readonly sides?: number | undefined;
}

/**
 * The single seam between the app and jj.
 *
 * Reads never mutate. Writes are the only calls that let jj snapshot the
 * working copy, and each returns the operation it produced so the caller can
 * re-pin its reads instead of guessing.
 */
export interface JjPort {
  /** Absolute path of the repo workspace root. */
  readonly root: string;

  /** The operation the repo head currently sits at. */
  currentOperation(): Promise<OperationId>;

  /** Revisions matching `revset`, in jj's own topological order. */
  log(revset: string, opts?: ReadOptions): Promise<Revision[]>;

  /** One revision, or `undefined` when the revset resolves to nothing. */
  show(rev: string, opts?: ReadOptions): Promise<Revision | undefined>;

  /** Files touched by `rev` relative to its parent(s). */
  diffSummary(rev: string, opts?: ReadOptions): Promise<FileChange[]>;

  /** Unified diff text for one file, or the whole revision when `path` is omitted. */
  diff(rev: string, path?: string, opts?: ReadOptions): Promise<string>;

  bookmarks(opts?: ReadOptions): Promise<Bookmark[]>;

  workspaces(opts?: ReadOptions): Promise<Workspace[]>;

  /** Most recent operations first. */
  operations(limit: number, opts?: ReadOptions): Promise<Operation[]>;

  /** Git directory, colocation and remotes. Not pinned: this is about the repo, not a point in it. */
  gitInfo(): Promise<GitInfo>;

  // ---- writes -------------------------------------------------------------

  /** Set the description of `rev`. */
  describe(rev: string, message: string): Promise<WriteResult>;

  /** Create a new empty change on top of `parents`. */
  newChange(parents: readonly string[], message?: string): Promise<WriteResult>;

  /** Point the working copy at an existing change. */
  edit(rev: string): Promise<WriteResult>;

  abandon(revs: readonly string[]): Promise<WriteResult>;

  bookmarkSet(name: string, rev: string): Promise<WriteResult>;

  bookmarkDelete(name: string): Promise<WriteResult>;

  /** Fetch from `remote`, or every configured remote when omitted. */
  fetch(remote?: string): Promise<WriteResult>;

  /**
   * Push bookmarks. With no `bookmarks`, pushes the tracked ones jj would pick
   * by default; `changes` pushes `--change` for each, minting bookmark names.
   */
  push(args?: {
    readonly remote?: string | undefined;
    readonly bookmarks?: readonly string[] | undefined;
    readonly changes?: readonly ChangeId[] | undefined;
  }): Promise<WriteResult>;

  /**
   * Move revisions onto a new parent.
   *
   * `mode` selects between jj's `-r` (this revision alone), `-s` (it and its
   * descendants) and `-b` (its whole branch). Use `rebaseSetRevset` to show
   * which revisions each mode would move before running it.
   */
  rebase(mode: RebaseMode, rev: string, onto: string): Promise<WriteResult>;

  /**
   * Move whole files from one revision into another (`jj squash`).
   *
   * With no `paths`, the entire revision is squashed.
   */
  squash(args: {
    readonly from: string;
    readonly into: string;
    readonly paths?: readonly string[] | undefined;
    readonly message?: string | undefined;
  }): Promise<WriteResult>;

  /**
   * Split a revision in two by whole files (`jj split`).
   *
   * `paths` land in the *first* (lower) revision with `message`; everything
   * else stays in the upper one, keeping the original description.
   */
  split(args: {
    readonly rev: string;
    readonly paths: readonly string[];
    readonly message?: string | undefined;
  }): Promise<WriteResult>;

  /**
   * Split a revision by individual hunks.
   *
   * `keep` describes the exact content each affected file should have in the
   * first revision; build it with `applySelectedGroups` and check it with
   * `verifyRoundTrip` first. Rejected when the port has no way to run jj's
   * diff-editor protocol.
   */
  splitHunks(args: {
    readonly rev: string;
    readonly keep: readonly PlanFile[];
    readonly message?: string | undefined;
  }): Promise<WriteResult>;

  /** Move individual hunks from one revision into another. */
  squashHunks(args: {
    readonly from: string;
    readonly into: string;
    readonly keep: readonly PlanFile[];
  }): Promise<WriteResult>;

  /** Raw content of one file at one revision, for computing partial trees. */
  fileContent(rev: string, path: string, opts?: ReadOptions): Promise<string>;

  /** Files with unresolved conflicts in `rev`. */
  conflicts(rev: string, opts?: ReadOptions): Promise<ConflictedFile[]>;

  /**
   * Resolve a conflicted file by taking one side wholesale.
   *
   * Uses jj's built-in `:ours` / `:theirs` merge tools, so no editor is
   * involved. Anything finer than "take a side" is a hunk-level edit.
   */
  resolveTakingSide(
    rev: string,
    path: string,
    side: "ours" | "theirs",
  ): Promise<WriteResult>;

  /**
   * Move each change in `from` into the closest mutable ancestor that last
   * touched those lines (`jj absorb`). jj has no dry run, so the preview is the
   * result itself: `message` says what moved where, and one undo takes it back.
   */
  absorb(from: string, into?: string): Promise<WriteResult>;

  /** Undo one operation (`jj undo`). */
  undo(): Promise<WriteResult>;

  /** Restore the repo to the state at `opId` (`jj op restore`). */
  restoreOperation(opId: OperationId): Promise<WriteResult>;
}

/**
 * The code forge behind the Git remote — GitHub via `gh` today.
 *
 * Kept apart from `JjPort` because it is a different process with a different
 * failure mode: a repo with no GitHub remote or no `gh` login simply has no
 * forge, and the stack panel must degrade to "push only" rather than error.
 */
export interface ForgePort {
  /** `owner/repo`, for display. */
  readonly slug: string;
  pullRequests(): Promise<PullRequest[]>;
  /** Returns the new PR's URL. */
  createPullRequest(args: {
    readonly head: string;
    readonly base: string;
    readonly title: string;
    readonly body: string;
  }): Promise<string>;
  /** Open the PR in the system browser. */
  openInBrowser(number: number): Promise<void>;
}

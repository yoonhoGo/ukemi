import type {
  AnnotationLine,
  Bookmark,
  ChangeId,
  FileChange,
  GitInfo,
  Operation,
  PullRequest,
  OperationId,
  Revision,
  RevsetAlias,
  RevsetFunction,
  Tag,
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

/**
 * A diff read, plus how much unchanged code to print around each change.
 *
 * jj's default is three lines, which is what a diff is *for*; `context` is how
 * the reader asks for the lines the diff hid. It belongs on the read rather
 * than in the app because jj already knows the file — reconstructing the gaps
 * on this side would mean fetching the whole blob and splicing it.
 */
export interface DiffOptions extends ReadOptions {
  readonly context?: number | undefined;
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
  diff(rev: string, path?: string, opts?: DiffOptions): Promise<string>;

  bookmarks(opts?: ReadOptions): Promise<Bookmark[]>;

  tags(opts?: ReadOptions): Promise<Tag[]>;

  /** `jj file annotate`: the change behind each line of `path` as of `rev`. */
  annotate(rev: string, path: string, opts?: ReadOptions): Promise<AnnotationLine[]>;

  workspaces(opts?: ReadOptions): Promise<Workspace[]>;

  /** Most recent operations first. */
  operations(limit: number, opts?: ReadOptions): Promise<Operation[]>;

  /** Git directory, colocation and remotes. Not pinned: this is about the repo, not a point in it. */
  gitInfo(): Promise<GitInfo>;

  /**
   * The revsets the user has named, from this repo's own config.
   *
   * Repo scope only (`jj config --repo`): jj's built-in aliases — `trunk()`,
   * `immutable_heads()` and friends — live in the defaults and would otherwise
   * flood a list whose whole job is "the ones you made". A user-global alias is
   * invisible here for the same reason, which is the ceiling of reading one
   * scope.
   *
   * Not a `ReadOptions` read: config is not part of an operation, so there is
   * no point in time to pin it to.
   */
  revsetAliases(): Promise<RevsetAlias[]>;

  /**
   * Name a revset, or rename what an existing name stands for.
   *
   * Returns no `WriteResult` because a config edit creates no operation — which
   * also means ⌘Z does not reach it. Deleting is the undo.
   */
  saveRevsetAlias(name: string, revset: string): Promise<void>;

  deleteRevsetAlias(name: string): Promise<void>;

  /**
   * Every revset function the bundled jj knows, from `jj help -k revsets`.
   *
   * Neither pinned nor repo-dependent: this is a property of the binary, so it
   * is the one read in this port that is the same all session.
   */
  revsetFunctions(): Promise<RevsetFunction[]>;

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

  /** Track `name@remote`, which is what mints the local bookmark for it. */
  bookmarkTrack(name: string, remote: string): Promise<WriteResult>;

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

  /**
   * Create a workspace at `path` (`jj workspace add`).
   *
   * The directory must be empty or absent — jj makes it when it is absent. Its
   * basename becomes the workspace name unless `name` says otherwise, which is
   * jj's own rule and the reason the UI can get away with a folder picker and
   * no second field.
   */
  addWorkspace(path: string, name?: string): Promise<WriteResult>;

  /**
   * Drop a workspace from the repo (`jj workspace forget`).
   *
   * The folder on disk stays — jj only stops tracking a working copy there, so
   * this is undoable with ⌘Z and deletes nothing the user wrote. Removing the
   * directory is the user's call, and not something this app should do behind
   * one button.
   */
  forgetWorkspace(name: string): Promise<WriteResult>;

  /** Undo one operation (`jj undo`). */
  undo(): Promise<WriteResult>;

  /**
   * Redo the operation the last `undo` took back (`jj redo`).
   *
   * jj's own docs call this the natural counterpart of undo — repeated undo
   * and redo behave like a text editor's, which is the promise the window
   * makes by binding ⌘Z at all. Redoing when nothing was undone is jj's
   * error to report, not a state this side tracks: the op log is the only
   * honest record of what is redoable, and mirroring it here would be a second
   * one that can drift.
   */
  redo(): Promise<WriteResult>;

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

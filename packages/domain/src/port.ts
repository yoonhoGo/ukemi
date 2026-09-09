import type {
  Bookmark,
  ChangeId,
  FileChange,
  Operation,
  OperationId,
  Revision,
  Workspace,
} from "./types.ts";

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

  /** Undo one operation (`jj undo`). */
  undo(): Promise<WriteResult>;

  /** Restore the repo to the state at `opId` (`jj op restore`). */
  restoreOperation(opId: OperationId): Promise<WriteResult>;
}

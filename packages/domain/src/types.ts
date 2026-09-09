/**
 * jj domain types.
 *
 * Identity rule that drives the whole UI: a **change ID** is stable across
 * rebases, a **commit ID** is not. Anything the user tracks visually — node
 * colour, selection, scrubber position — keys off `changeId`.
 */

/** 32-char reverse-hex change ID. Stable across rebase/amend. */
export type ChangeId = string;
/** 40-char hex commit (Git) ID. Changes whenever the commit is rewritten. */
export type CommitId = string;
/** Opaque operation ID from the op log. */
export type OperationId = string;

export interface Signature {
  readonly name: string;
  readonly email: string;
  /** ISO-8601 with offset, as jj emits it. */
  readonly timestamp: string;
}

export interface Revision {
  readonly changeId: ChangeId;
  readonly commitId: CommitId;
  /** Full description including trailing newline stripped. */
  readonly description: string;
  readonly author: Signature;
  /** Parent *change* IDs, so topology survives rebases. */
  readonly parents: readonly ChangeId[];
  /** Local bookmark names pointing here. */
  readonly bookmarks: readonly string[];
  readonly tags: readonly string[];
  readonly isWorkingCopy: boolean;
  readonly isEmpty: boolean;
  readonly hasConflict: boolean;
  /** Immutable per the repo's `revset-aliases.immutable_heads()`. */
  readonly isImmutable: boolean;
  readonly isDivergent: boolean;
}

export interface Bookmark {
  readonly name: string;
  /** Absent when the bookmark is deleted locally but still on a remote. */
  readonly target?: ChangeId | undefined;
  /** Remote name when this row is a remote-tracking bookmark. */
  readonly remote?: string | undefined;
  /** Ahead/behind against the tracked remote, when tracking. */
  readonly ahead?: number | undefined;
  readonly behind?: number | undefined;
  readonly hasConflict: boolean;
}

export interface Operation {
  readonly id: OperationId;
  readonly description: string;
  /** ISO-8601 end time. */
  readonly time: string;
  /** `user@host` as recorded by jj. */
  readonly user: string;
  /** The `jj` argv that produced this operation, when recorded. */
  readonly args?: string | undefined;
  /** True for the operation the repo currently sits at. */
  readonly isCurrent: boolean;
}

export interface Workspace {
  readonly name: string;
  /** The change this workspace's working copy sits on. */
  readonly changeId: ChangeId;
}

export type FileStatus = "added" | "modified" | "removed" | "renamed" | "copied";

export interface FileChange {
  readonly path: string;
  readonly status: FileStatus;
  /** Present only when a stat was requested; diffs are counted lazily. */
  readonly insertions?: number | undefined;
  readonly deletions?: number | undefined;
}

/** A revision plus the layout the graph renderer needs. Produced by `layoutGraph`. */
export interface GraphRow {
  readonly revision: Revision;
  /** Row index, top-down. */
  readonly row: number;
  /** Lane index; 0 is leftmost. */
  readonly lane: number;
  /** Edges leaving this row downward toward a parent. */
  readonly edges: readonly GraphEdge[];
}

export interface GraphEdge {
  readonly toChangeId: ChangeId;
  readonly fromLane: number;
  readonly toLane: number;
  readonly toRow: number;
  /** True when the parent is not in the current revset (elided `~` in jj log). */
  readonly elided: boolean;
}

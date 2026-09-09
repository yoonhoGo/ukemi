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
  /** Committer; its timestamp moves on every snapshot, so it is "last touched". */
  readonly committer: Signature;
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

/**
 * A revset the user named and kept.
 *
 * Stored as one of jj's own `revset-aliases`, so the name works in the ⌘L
 * field *and* in `jj log -r <name>` at a terminal. That is the whole reason
 * this is not an app-private list: a saved query that only the GUI understands
 * would be a second, weaker idea of the same thing.
 */
export interface RevsetAlias {
  readonly name: string;
  /** The expression the name stands for. */
  readonly revset: string;
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

export interface GitRemote {
  readonly name: string;
  readonly url: string;
}

/** What the transparency panel says about the Git side of the repo. */
export interface GitInfo {
  /** The Git directory jj's backend uses. */
  readonly gitRoot: string;
  /** True when `.git` sits beside `.jj`, so bookmarks are exported as branches. */
  readonly colocated: boolean;
  readonly remotes: readonly GitRemote[];
}

export type PullRequestState = "open" | "merged" | "closed";

/** A pull request on the forge, matched to a revision through its head branch. */
export interface PullRequest {
  readonly number: number;
  readonly title: string;
  readonly state: PullRequestState;
  readonly url: string;
  /** Git branch name, which in jj is the bookmark name. */
  readonly headBranch: string;
  readonly baseBranch: string;
  readonly isDraft: boolean;
  /** `APPROVED`, `CHANGES_REQUESTED`, `REVIEW_REQUIRED` or empty. */
  readonly reviewDecision: string;
}

/** One CLI invocation the app made, for the transparency panel. */
export interface CommandRecord {
  /** `jj` or `gh`. */
  readonly program: string;
  readonly args: readonly string[];
  readonly code: number;
  readonly stderr: string;
  /** ISO-8601. */
  readonly startedAt: string;
  readonly durationMs: number;
}

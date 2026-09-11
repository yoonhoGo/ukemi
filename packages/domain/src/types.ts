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
  /**
   * Remote-tracking names (`main@origin`) pointing here that the local
   * bookmark of that name does not. Empty in the ordinary case, where local
   * and remote agree; non-empty is exactly the state worth seeing.
   */
  readonly remoteBookmarks: readonly string[];
  readonly tags: readonly string[];
  readonly isWorkingCopy: boolean;
  readonly isEmpty: boolean;
  readonly hasConflict: boolean;
  /** Immutable per the repo's `revset-aliases.immutable_heads()`. */
  readonly isImmutable: boolean;
  readonly isDivergent: boolean;
  /**
   * Whether the commit carries a cryptographic signature at all.
   *
   * Not who signed it or whether the key is trusted: verifying that needs the
   * signing backend the repo may not have configured, and a badge that said
   * "signed" about a signature nobody checked would be worse than no badge.
   */
  readonly isSigned: boolean;
}

export interface Bookmark {
  readonly name: string;
  /** Absent when the bookmark is deleted locally but still on a remote. */
  readonly target?: ChangeId | undefined;
  /** Remote name when this row is a remote-tracking bookmark. */
  readonly remote?: string | undefined;
  /**
   * How far apart this row and the local bookmark of the same name are, when
   * tracking; absent on an untracked row, which is the test for tracking.
   *
   * Counted from *this row's* side, the way jj counts it: on a `main@origin`
   * row `ahead` is what the remote has and the local does not — jj prints it
   * as "@origin (ahead by 1 commits)" — so it is the local bookmark that is
   * behind by that many. A UI that draws the local row has to swap them; see
   * `localBookmarks`.
   */
  readonly ahead?: number | undefined;
  readonly behind?: number | undefined;
  readonly hasConflict: boolean;
}

/** A tag, as `jj tag list` reports it. Local rows only. */
export interface Tag {
  readonly name: string;
  /** Change the tag points at; absent when the tag is conflicted or deleted. */
  readonly target?: ChangeId | undefined;
}

/** One line of `jj file annotate`: who last touched it, and with what. */
export interface AnnotationLine {
  readonly changeId: ChangeId;
  readonly lineNumber: number;
  /** False when the line above came from the same change — the row draws no header. */
  readonly firstInHunk: boolean;
  readonly author: Signature;
  /** First line of the change's description. */
  readonly subject: string;
  /** Line content, newline stripped. */
  readonly content: string;
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

/**
 * One revset function, as jj's own help describes it.
 *
 * Read from the bundled binary rather than listed here, so the set moves with
 * the jj the app ships. `about` is jj's English sentence, kept verbatim and
 * untranslated for the same reason `runs` is in the Rosetta table: it is the
 * tool's own wording, and paraphrasing it would make the window a less
 * reliable teacher than the CLI.
 */
export interface RevsetFunction {
  readonly name: string;
  /** The parameter list as written, e.g. `[pattern]` or `x, [depth]`. */
  readonly params: string;
  /** The first sentence of jj's description. */
  readonly about: string;
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

/**
 * Every check on a PR's head, rolled into one word.
 *
 * One word rather than the list: the panel has a 26px row and the question it
 * is answering is "can this merge". A failure outranks anything still running,
 * because a red run is settled and a pending one is not news. `none` covers a
 * repo with no CI at all as well as a PR whose checks have not been created
 * yet — indistinguishable from outside, and the badge says nothing either way.
 */
export type CheckState = "passing" | "failing" | "pending" | "none";

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
  /** CI on the head commit, rolled up. */
  readonly checks: CheckState;
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

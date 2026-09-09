/**
 * The transition from Git, as state.
 *
 * Seven habits Git gave you, each with the jj thing that replaced it. A
 * milestone is *reached* by doing it once — never by reading about it — and the
 * hint that explains it appears immediately afterwards, while the thing you
 * just pressed is still the subject. Acknowledging a hint retires it for good.
 *
 * Deliberately not a wizard: a seven-step tour up front is skipped, and then
 * nothing is there in the moment the Git reflex actually fires. This is the
 * other order.
 *
 * Progress belongs to the *user*, not to a repository — the habits are theirs —
 * so it lives under one key and does not reset when another repo is opened.
 */
import type { CommandRecord } from "@ukemi/domain";

/** Where a hint points. Three fixed spots; the bubble is not a tooltip engine. */
export type HintAnchor = "toolbar" | "inspector" | "sidebar" | "timeline";

export interface Milestone {
  readonly id: string;
  /** The jj thing, as the progress panel lists it. */
  readonly label: string;
  /** The Git command it stands in for, in Git's own spelling. */
  readonly replaces: string;
  /** The shortcut, when there is one worth badging. */
  readonly shortcut?: string;
  readonly anchor: HintAnchor;
  /** The hint headline. Names the Git thing, because that is what is being looked for. */
  readonly title: string;
  readonly body: string;
}

/**
 * The seven, in the order a working session tends to meet them.
 *
 * Order matters only for the progress panel; a milestone is reached whenever it
 * happens, and skipping ahead is normal.
 */
export const MILESTONES: readonly Milestone[] = [
  {
    id: "working-copy",
    label: "The working copy is a commit",
    replaces: "git add",
    shortcut: "⌘N",
    anchor: "toolbar",
    title: "This is where git commit went.",
    body:
      "⌘N closes the change you were in and opens a fresh one on top. There was nothing to stage first: every file you had saved was already in it.",
  },
  {
    id: "describe",
    label: "A description stays editable",
    replaces: "git commit --amend",
    shortcut: "⌘↩",
    anchor: "inspector",
    title: "No --amend, because nothing was sealed.",
    body:
      "A description is a property of the change, editable for as long as the change is yours — including after you have pushed it. Rewriting is the normal case here, not the dangerous one.",
  },
  {
    id: "undo",
    label: "Undo is one operation back",
    replaces: "git reflog",
    shortcut: "⌘Z",
    anchor: "timeline",
    title: "That was the reflog, and it is a timeline.",
    body:
      "Every command that touched the repository is one row down there — rebases and merges included. Drag the playhead to read any past state; nothing is written until you restore.",
  },
  {
    id: "bookmarks",
    label: "Bookmarks, not branches",
    replaces: "git checkout -b",
    shortcut: "⇧⌘P",
    anchor: "toolbar",
    title: "The name arrived at push time.",
    body:
      "Nothing was checked out and no branch was created: a bookmark is a name left on a commit. Pushing a stack mints the names and moves them again after a rebase, so there is no force push to argue about.",
  },
  {
    id: "hunks",
    label: "Split and squash by hunk",
    replaces: "git add -p",
    shortcut: "⌘⇧S",
    anchor: "inspector",
    title: "This is git add -p, after the fact.",
    body:
      "Because the change already exists, choosing what goes where is something you do afterwards rather than before. One change becomes two, or two become one, with the same sheet.",
  },
  {
    id: "conflicts",
    label: "A conflict does not stop you",
    replaces: "git rebase --abort",
    anchor: "inspector",
    title: "Nothing is blocked. There is nothing to abort.",
    body:
      "The conflict is recorded in the commit, so the rebase finished and the rest of your stack moved with it. Resolve it now, or leave it and come back — either way the repository is not holding its breath.",
  },
  {
    id: "workspaces",
    label: "Workspaces run side by side",
    replaces: "git worktree",
    shortcut: "⌘⇧W",
    anchor: "sidebar",
    title: "Worktrees, without the bookkeeping.",
    body:
      "Each workspace has its own working copy and its own @ over one shared history, so a second one — or an agent — can work while you do. The board is the same data by workspace.",
  },
];

export const MILESTONE_COUNT = MILESTONES.length;

export function milestone(id: string): Milestone | undefined {
  return MILESTONES.find((entry) => entry.id === id);
}

/**
 * What the user has been through.
 *
 * `reached` is what they have done; `acked` is which hints they have dismissed.
 * Both are kept because they answer different questions — the progress panel
 * counts the first, the bubble reads the difference.
 */
export interface Progress {
  readonly reached: readonly string[];
  readonly acked: readonly string[];
  /** Set once the three welcome cards have been shown. Not per-repo. */
  readonly welcomed: boolean;
  /** The user has turned hints off by hand, before graduating. */
  readonly hintsOff: boolean;
}

export const NO_PROGRESS: Progress = {
  reached: [],
  acked: [],
  welcomed: false,
  hintsOff: false,
};

/** Reached, in the panel's order. Unknown ids are ignored, so a rename is safe. */
export function reachedCount(progress: Progress): number {
  return MILESTONES.filter((entry) => progress.reached.includes(entry.id)).length;
}

/** All seven done: the coach has nothing left to say and retires itself. */
export function hasGraduated(progress: Progress): boolean {
  return reachedCount(progress) >= MILESTONE_COUNT;
}

/**
 * The hint to show right now, if any.
 *
 * The *most recently* reached milestone wins, because it is the one the user
 * just caused — showing an older unacknowledged hint instead would explain
 * something they are no longer looking at. Order comes from `reached` itself,
 * which is append-only.
 */
export function pendingHint(progress: Progress): Milestone | undefined {
  if (progress.hintsOff) return undefined;
  for (let i = progress.reached.length - 1; i >= 0; i -= 1) {
    const id = progress.reached[i]!;
    if (progress.acked.includes(id)) continue;
    const found = milestone(id);
    if (found) return found;
  }
  return undefined;
}

/** Mark a milestone reached. Idempotent, and never re-opens an acknowledged hint. */
export function reach(progress: Progress, id: string): Progress {
  if (!milestone(id) || progress.reached.includes(id)) return progress;
  return { ...progress, reached: [...progress.reached, id] };
}

export function acknowledge(progress: Progress, id: string): Progress {
  if (progress.acked.includes(id)) return progress;
  return { ...progress, acked: [...progress.acked, id] };
}

/**
 * The milestone a finished command proves, if any.
 *
 * Read off the command log rather than wired to each button, because the same
 * jj verb is reachable from several places — the inspector's next steps, the
 * hunk sheet, the stack panel, a drag in the graph — and a milestone that only
 * ticked from one of them would be a lie about what the user has done. It also
 * keeps the whole mapping in one testable place instead of scattered across
 * five components.
 *
 * Two of the seven have no command behind them (meeting a conflict, opening the
 * board) and are reached by the window itself.
 *
 * Only successful writes count: a command that failed taught nothing.
 */
export function milestoneForCommand(record: CommandRecord): string | undefined {
  if (record.program !== "jj" || record.code !== 0) return undefined;
  const [verb, sub] = record.args;
  if (verb === "new") return "working-copy";
  if (verb === "describe") return "describe";
  if (verb === "undo") return "undo";
  if (verb === "op" && sub === "restore") return "undo";
  if (verb === "split" || verb === "squash" || verb === "absorb") return "hunks";
  if (verb === "workspace" && sub === "add") return "workspaces";
  // Both spellings of "a name landed on a commit". `bookmark delete` is
  // deliberately not one of them: deleting a name teaches nothing about how it
  // got there.
  if (verb === "bookmark" && sub === "set") return "bookmarks";
  if (verb === "git" && sub === "push") return "bookmarks";
  return undefined;
}

// ---- persistence -----------------------------------------------------------

const KEY = "ukemi:onboarding";

/**
 * Module-level, like the command log, and read through `useSyncExternalStore`.
 *
 * Not React state and not a query: it is neither derived from the repo nor
 * owned by one component, and the sidebar strip, the bubble and the progress
 * panel all have to agree about it within the same render.
 */
let current: Progress = load();
const listeners = new Set<() => void>();

function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return NO_PROGRESS;
    const parsed = JSON.parse(raw) as Partial<Progress>;
    return {
      // Storage is the user's own file and can be hand-edited or written by an
      // older build, so each field is taken only when it has the right shape.
      reached: Array.isArray(parsed.reached) ? parsed.reached.filter(isId) : [],
      acked: Array.isArray(parsed.acked) ? parsed.acked.filter(isId) : [],
      welcomed: parsed.welcomed === true,
      hintsOff: parsed.hintsOff === true,
    };
  } catch {
    // Blocked storage or unparsable JSON: start over rather than crash the
    // window. The cost of forgetting is one repeated hint.
    return NO_PROGRESS;
  }
}

const isId = (value: unknown): value is string => typeof value === "string";

function commit(next: Progress): void {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // The window still behaves correctly for this session; only the memory of
    // it is lost.
  }
  for (const listener of listeners) listener();
}

export function subscribeProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function progressSnapshot(): Progress {
  return current;
}

/** Record that the user just did the thing. Safe to call on every occurrence. */
export function reachMilestone(id: string): void {
  commit(reach(current, id));
}

export function acknowledgeHint(id: string): void {
  commit(acknowledge(current, id));
}

export function setHintsOff(off: boolean): void {
  commit({ ...current, hintsOff: off });
}

export function markWelcomed(): void {
  commit({ ...current, welcomed: true });
}

/** Test seam, and what a "start over" affordance would call. */
export function resetProgress(): void {
  commit(NO_PROGRESS);
}

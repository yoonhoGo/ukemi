import type { ChangeId, PullRequest, Revision } from "./types.ts";

/**
 * Stacks — design §4.5.
 *
 * A stack is the run of mutable revisions that a change sits in: down to the
 * first immutable ancestor, up while there is exactly one child. jj has no
 * name for this because it needs none (bookmarks are optional), which is
 * exactly why the UI has to recognise it: "push this stack as PRs" is a
 * question about a chain, not a bookmark.
 *
 * Bottom-up order, so index 0 is the revision that lands first.
 */
export function stackOf(revisions: readonly Revision[], head: ChangeId): Revision[] {
  const byId = new Map(revisions.map((r) => [r.changeId, r]));
  const children = new Map<ChangeId, Revision[]>();
  for (const revision of revisions) {
    for (const parent of revision.parents) {
      const list = children.get(parent) ?? [];
      list.push(revision);
      children.set(parent, list);
    }
  }

  const start = byId.get(head);
  if (!start || start.isImmutable) return [];

  // Down: follow the single parent while it is mutable and visible.
  const down: Revision[] = [];
  let cursor: Revision | undefined = start;
  while (cursor && !cursor.isImmutable) {
    down.push(cursor);
    if (cursor.parents.length !== 1) break;
    cursor = byId.get(cursor.parents[0]!);
  }

  // Up: follow the unique mutable child. A fork ends the stack — which branch
  // the user means is not knowable, so neither is offered.
  const up: Revision[] = [];
  let tip: Revision = start;
  for (;;) {
    const next: Revision[] = (children.get(tip.changeId) ?? []).filter((c) => !c.isImmutable);
    if (next.length !== 1 || next[0]!.parents.length !== 1) break;
    tip = next[0]!;
    up.push(tip);
  }

  return [...down.reverse(), ...up];
}

/**
 * Every mutable revision mapped to the head of the stack it sits in.
 *
 * The head — the topmost member — is the stack's name here, because it is what
 * survives: rebasing a stack moves its base, not its tip, so a key taken from
 * the head keeps a stack's identity across the move. Immutable revisions are
 * absent from the map: they belong to no stack, and a caller that wants a
 * colour for one already has `isImmutable` to branch on.
 *
 * ponytail: O(n²) — one `stackOf` walk per revision. The revset the window
 * loads is bounded (jj's `revsets.log`, tens of rows), so this stays under a
 * millisecond; memoise the walk if a log-everything revset ever lands here.
 */
export function stackHeads(revisions: readonly Revision[]): Map<ChangeId, ChangeId> {
  const heads = new Map<ChangeId, ChangeId>();
  for (const revision of revisions) {
    // Asking from each revision rather than once per stack is what makes a
    // fork resolve the way the graph draws it: the shared base below a fork is
    // its own stack, each branch above it another.
    const stack = stackOf(revisions, revision.changeId);
    const head = stack[stack.length - 1];
    if (head) heads.set(revision.changeId, head.changeId);
  }
  return heads;
}

/**
 * Why a revision cannot be pushed as a PR, or `undefined` when it can.
 * Mirrors the two refusals `jj git push` makes on its own.
 */
export function unpushableReason(revision: Revision): string | undefined {
  if (revision.isEmpty) return "empty";
  if (revision.description.trim().length === 0) return "no description";
  if (revision.hasConflict) return "conflicted";
  return undefined;
}

/** The PR whose head branch is one of the revision's bookmarks, if any. */
export function pullRequestFor(
  revision: Revision,
  pullRequests: readonly PullRequest[],
): PullRequest | undefined {
  // Prefer an open one: a merged PR on a bookmark that was reused is history.
  const matches = pullRequests.filter((pr) => revision.bookmarks.includes(pr.headBranch));
  return matches.find((pr) => pr.state === "open") ?? matches[0];
}

/**
 * The branch a PR for `stack[index]` should target: the bookmark of the
 * revision below it, so the stack reviews as a chain, or `trunk` at the bottom.
 */
export function prBaseFor(
  stack: readonly Revision[],
  index: number,
  trunk: string,
): string | undefined {
  const below = stack[index - 1];
  if (!below) return trunk;
  return below.bookmarks[0];
}

/** The head branch to open a PR from: the first bookmark, which push --change mints. */
export function prHeadFor(revision: Revision): string | undefined {
  return revision.bookmarks[0];
}

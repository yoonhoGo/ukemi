import { test } from "node:test";
import assert from "node:assert/strict";
import { prBaseFor, pullRequestFor, stackHeads, stackOf, unpushableReason } from "./stack.ts";
import type { PullRequest, Revision } from "./types.ts";

function rev(
  changeId: string,
  parents: string[] = [],
  extra: Partial<Revision> = {},
): Revision {
  const sig = { name: "T", email: "t@e", timestamp: "2026-01-01T00:00:00+09:00" };
  return {
    changeId,
    commitId: changeId.repeat(2),
    description: changeId,
    author: sig,
    committer: sig,
    parents,
    bookmarks: [],
    remoteBookmarks: [],
    tags: [],
    isWorkingCopy: false,
    isEmpty: false,
    hasConflict: false,
    isImmutable: false,
    isDivergent: false,
    isSigned: false,
    ...extra,
  };
}

// trunk(immutable) ← a ← b ← c, plus d forking off a.
const trunk = rev("trunk", [], { isImmutable: true, bookmarks: ["main"] });
const a = rev("a", ["trunk"], { bookmarks: ["push-a"] });
const b = rev("b", ["a"]);
const c = rev("c", ["b"], { isEmpty: true, description: "" });

test("a linear chain is one stack, bottom-up, stopping at the immutable base", () => {
  const ids = stackOf([c, b, a, trunk], "b").map((r) => r.changeId);
  assert.deepEqual(ids, ["a", "b", "c"]);
});

test("a fork above the selection ends the stack there", () => {
  const d = rev("d", ["a"]);
  assert.deepEqual(
    stackOf([d, c, b, a, trunk], "a").map((r) => r.changeId),
    ["a"],
  );
  // From inside one branch the whole branch is still a stack.
  assert.deepEqual(
    stackOf([d, c, b, a, trunk], "b").map((r) => r.changeId),
    ["a", "b", "c"],
  );
});

test("an immutable selection has no stack", () => {
  assert.deepEqual(stackOf([c, b, a, trunk], "trunk"), []);
});

test("stack heads name a chain by its tip, and a fork by each branch", () => {
  assert.deepEqual(
    [...stackHeads([c, b, a, trunk])],
    [
      ["c", "c"],
      ["b", "c"],
      ["a", "c"],
    ],
    "a linear chain is one colour, the tip's",
  );

  const d = rev("d", ["a"]);
  const forked = stackHeads([d, c, b, a, trunk]);
  assert.equal(forked.get("c"), "c");
  assert.equal(forked.get("b"), "c");
  assert.equal(forked.get("d"), "d", "the other branch is its own stack");
  assert.equal(forked.get("a"), "a", "the base below a fork belongs to neither");
  assert.equal(forked.has("trunk"), false, "immutable revisions sit in no stack");
});

test("empty and undescribed revisions are reported as unpushable", () => {
  assert.equal(unpushableReason(a), undefined);
  assert.equal(unpushableReason(c), "empty");
  assert.equal(unpushableReason(rev("x", [], { description: "  " })), "no description");
});

test("PR bases chain through the stack and land on trunk at the bottom", () => {
  const stack = [a, b, c];
  assert.equal(prBaseFor(stack, 0, "main"), "main");
  assert.equal(prBaseFor(stack, 1, "main"), "push-a");
  assert.equal(prBaseFor(stack, 2, "main"), undefined, "b has no bookmark yet");
});

test("an open PR wins over a merged one on the same bookmark", () => {
  const merged: PullRequest = {
    number: 1, title: "old", state: "merged", url: "", headBranch: "push-a",
    baseBranch: "main", isDraft: false, reviewDecision: "", checks: "none",
  };
  const open: PullRequest = { ...merged, number: 2, state: "open" };
  assert.equal(pullRequestFor(a, [merged, open])?.number, 2);
  assert.equal(pullRequestFor(b, [merged, open]), undefined);
});

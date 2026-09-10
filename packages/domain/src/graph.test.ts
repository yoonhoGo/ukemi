import { test } from "node:test";
import assert from "node:assert/strict";
import { ELIDED_ROW, layoutGraph } from "./graph.ts";
import type { Revision } from "./types.ts";

/** Minimal revision; only changeId/parents matter to the layout. */
function rev(changeId: string, parents: string[] = []): Revision {
  return {
    changeId,
    commitId: changeId.repeat(2),
    description: changeId,
    author: { name: "T", email: "t@e", timestamp: "2026-01-01T00:00:00+09:00" },
    committer: { name: "T", email: "t@e", timestamp: "2026-01-01T00:00:00+09:00" },
    parents,
    bookmarks: [],
    remoteBookmarks: [],
    tags: [],
    isWorkingCopy: false,
    isEmpty: false,
    hasConflict: false,
    isImmutable: false,
    isDivergent: false,
  };
}

test("linear history stays in one lane", () => {
  const layout = layoutGraph([rev("c", ["b"]), rev("b", ["a"]), rev("a")]);
  assert.deepEqual(
    layout.rows.map((r) => r.lane),
    [0, 0, 0],
  );
  assert.equal(layout.laneCount, 1);
  assert.equal(layout.rows[0]!.edges[0]!.toRow, 1);
});

test("a fork takes a second lane and both sides rejoin the shared parent", () => {
  // c and d both sit on b:  c(0) d(1) b(0) — d branches right, then joins b.
  const layout = layoutGraph([
    rev("c", ["b"]),
    rev("d", ["b"]),
    rev("b", ["a"]),
    rev("a"),
  ]);
  assert.equal(layout.laneCount, 2);
  assert.deepEqual(
    layout.rows.map((r) => r.lane),
    [0, 1, 0, 0],
  );
  // Both forks must aim at the *same* lane, or the join renders as two stubs.
  assert.equal(layout.rows[0]!.edges[0]!.toLane, 0);
  assert.equal(layout.rows[1]!.edges[0]!.toLane, 0);
  assert.equal(layout.rows[1]!.edges[0]!.toRow, 2);
});

test("a merge emits one edge per parent, on distinct lanes", () => {
  const layout = layoutGraph([
    rev("m", ["x", "y"]),
    rev("x", ["base"]),
    rev("y", ["base"]),
    rev("base"),
  ]);
  const edges = layout.rows[0]!.edges;
  assert.equal(edges.length, 2);
  assert.equal(edges[0]!.toLane, 0);
  assert.equal(edges[1]!.toLane, 1);
  assert.deepEqual(
    edges.map((e) => e.toRow),
    [1, 2],
  );
  assert.equal(layout.laneCount, 2);
});

test("a parent outside the revset is marked elided, not dropped", () => {
  const layout = layoutGraph([rev("only", ["missing"])]);
  const edge = layout.rows[0]!.edges[0]!;
  assert.equal(edge.elided, true);
  assert.equal(edge.toRow, ELIDED_ROW);
  assert.equal(edge.toChangeId, "missing");
});

test("lanes are reused after a branch closes, so width does not creep", () => {
  // side branches off, closes at base; a later head must reuse lane 1.
  const layout = layoutGraph([
    rev("head", ["base"]),
    rev("side", ["base"]),
    rev("base", []),
    rev("other", []),
  ]);
  assert.equal(layout.laneCount, 2);
  assert.equal(layout.rows[3]!.lane, 0);
});

test("a lane held by an elided parent is freed for the next stack", () => {
  // Two disjoint stacks, each rooted on a parent outside the revset: the
  // second must reuse lane 0 instead of being pushed right by a `~`.
  const layout = layoutGraph([rev("a", ["a-root"]), rev("b", ["b-root"])]);
  assert.deepEqual(
    layout.rows.map((r) => r.lane),
    [0, 0],
  );
  assert.equal(layout.laneCount, 1);
  assert.deepEqual(
    layout.rows.map((r) => r.edges[0]!.elided),
    [true, true],
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  localBookmarks,
  orderRows,
  reorder,
  sortBookmarks,
  sortTags,
  unpushedBookmarks,
} from "./sidebar-state.ts";

test("orderRows follows the remembered order and appends the unknown", () => {
  const rows = ["a", "b", "c", "d"];
  assert.deepEqual(orderRows(rows, (r) => r, ["c", "a", "zz"]), ["c", "a", "b", "d"]);
  assert.deepEqual(orderRows(rows, (r) => r, []), rows);
});

test("reorder drops a row onto another's place in either direction", () => {
  assert.deepEqual(reorder(["a", "b", "c", "d"], "d", "b"), ["a", "d", "b", "c"]);
  assert.deepEqual(reorder(["a", "b", "c", "d"], "a", "c"), ["b", "c", "a", "d"]);
  assert.deepEqual(reorder(["a", "b"], "a", "x"), ["a", "b"]);
  assert.deepEqual(reorder(["a", "b"], "a", "a"), ["a", "b"]);
});

test("tags sort newest version first, numerically", () => {
  const names = (tags: { name: string }[]) => sortTags(tags).map((t) => t.name);
  assert.deepEqual(names([{ name: "v1.2" }, { name: "v1.10" }, { name: "v1.9" }]), [
    "v1.10",
    "v1.9",
    "v1.2",
  ]);
});

test("bookmarks pin trunk first, then natural order", () => {
  const names = (list: string[]) =>
    sortBookmarks(list.map((name) => ({ name })), "main").map((b) => b.name);
  assert.deepEqual(names(["issue-10", "main", "issue-9", "Feature"]), [
    "main",
    "Feature",
    "issue-9",
    "issue-10",
  ]);
  assert.deepEqual(
    sortBookmarks([{ name: "b" }, { name: "a" }], undefined).map((b) => b.name),
    ["a", "b"],
  );
});

test("a bookmark only the colocated git repo has still counts as unpushed", () => {
  // What a colocated repo reports for a name nobody has pushed: jj tracks the
  // `git` remote by construction, so the row exists with counts of 0 and would
  // otherwise fold in and read as "pushed, up to date".
  const rows = [
    { name: "my-feature", target: "kk", hasConflict: false },
    { name: "my-feature", target: "kk", remote: "git", ahead: 0, behind: 0, hasConflict: false },
    { name: "main", target: "mm", hasConflict: false },
    { name: "main", target: "mm", remote: "git", ahead: 0, behind: 0, hasConflict: false },
    { name: "main", target: "mm", remote: "origin", ahead: 2, behind: 0, hasConflict: false },
  ];
  assert.deepEqual(unpushedBookmarks(rows), ["my-feature"]);
  assert.deepEqual(
    localBookmarks(rows).map((bookmark) => [bookmark.name, bookmark.ahead]),
    [
      ["my-feature", undefined],
      ["main", 2],
    ],
  );
});

test("a bookmark deleted locally is not something to push", () => {
  // Present on the remote, gone here: the row has no target, and naming it in
  // a push would ask jj to delete the remote side, which is not this button.
  assert.deepEqual(
    unpushedBookmarks([{ name: "gone", remote: "origin", hasConflict: false }]),
    [],
  );
});

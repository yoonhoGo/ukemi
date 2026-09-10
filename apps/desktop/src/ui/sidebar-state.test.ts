import { test } from "node:test";
import assert from "node:assert/strict";
import { orderRows, reorder, sortBookmarks, sortTags } from "./sidebar-state.ts";

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

import { test } from "node:test";
import assert from "node:assert/strict";
import { orderRows, reorder } from "./sidebar-state.ts";

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

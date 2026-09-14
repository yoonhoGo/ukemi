import { test } from "node:test";
import assert from "node:assert/strict";
import { isNewer } from "./update-check.ts";

test("a higher release is an update, in any of the three positions", () => {
  assert.equal(isNewer("v0.9.0", "0.8.0"), true);
  assert.equal(isNewer("v0.8.1", "0.8.0"), true);
  assert.equal(isNewer("v1.0.0", "0.8.0"), true);
  // 10 > 9 as a number, and would be false as a string.
  assert.equal(isNewer("v0.10.0", "0.9.0"), true);
});

test("the same or an older release is not", () => {
  assert.equal(isNewer("v0.8.0", "0.8.0"), false);
  assert.equal(isNewer("v0.7.9", "0.8.0"), false);
});

test("a tag that is not a release version is never an update", () => {
  assert.equal(isNewer("nightly", "0.8.0"), false);
  assert.equal(isNewer("v0.8", "0.8.0"), false);
  assert.equal(isNewer("v0.9.0", "not-a-version"), false);
});

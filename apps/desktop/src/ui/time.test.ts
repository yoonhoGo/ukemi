import { test } from "node:test";
import assert from "node:assert/strict";
import { relativeTime } from "./time.ts";

const NOW = Date.parse("2026-09-09T12:00:00+09:00");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

test("buckets recent times the way a working session reads them", () => {
  assert.equal(relativeTime(ago(10_000), NOW), "now");
  assert.equal(relativeTime(ago(12 * 60_000), NOW), "12m");
  assert.equal(relativeTime(ago(3 * 3_600_000), NOW), "3h");
  assert.equal(relativeTime(ago(24 * 3_600_000), NOW), "yesterday");
  assert.equal(relativeTime(ago(3 * 24 * 3_600_000), NOW), "3d");
});

test("anything older than a week becomes a date, not a day count", () => {
  assert.doesNotMatch(relativeTime(ago(60 * 24 * 3_600_000), NOW), /\d+d$/);
});

test("an unparseable timestamp is shown verbatim, never as Invalid Date", () => {
  assert.equal(relativeTime("not-a-time", NOW), "not-a-time");
});

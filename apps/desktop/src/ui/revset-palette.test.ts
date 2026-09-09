import { test } from "node:test";
import assert from "node:assert/strict";
import { insertIntoDraft, rankRevsetRows, revsetRows } from "./revset-palette.ts";

const rows = revsetRows({
  aliases: [
    { name: "my-stack", revset: "mine() & mutable()" },
    { name: "bookmarked", revset: "bookmarks() | remote_bookmarks()" },
  ],
  bookmarks: [
    { name: "main", target: "qpyuntsm", hasConflict: false },
    // The remote-tracking row for the same bookmark: one name, one row.
    { name: "main", remote: "origin", target: "qpyuntsm", hasConflict: false },
    { name: "feature", target: "rlvkpnrz", hasConflict: false },
  ],
  workspaces: [{ name: "default", changeId: "wmkzolqt" }],
  functions: [
    { name: "bookmarks", params: "[pattern]", about: "All local bookmark targets." },
    {
      name: "remote_bookmarks",
      params: "[name_pattern]",
      about: "All remote bookmarks targets across all remotes.",
    },
    { name: "mine", params: "", about: "Commits where the author's email matches yours." },
  ],
});

const names = (query: string, limit = 10) =>
  rankRevsetRows(rows, query, limit).map((row) => row.name);

test("a remote-tracking bookmark does not become a second row", () => {
  assert.deepEqual(
    rows.filter((row) => row.kind === "bookmark").map((row) => row.name),
    ["main", "feature"],
  );
});

test("a prefix of the name beats a mention of it", () => {
  // `boo` on the front of `bookmarks(…)` and inside `remote_bookmarks(…)`;
  // `bookmarked` mentions neither in its name, so it ranks on its expansion.
  assert.deepEqual(names("boo"), [
    "bookmarked",
    "bookmarks([pattern])",
    "remote_bookmarks([name_pattern])",
  ]);
  // What the user typed outranks what merely contains it, whatever kind it is:
  // `mine` *is* the function's name, and only appears inside my-stack's
  // expansion.
  assert.deepEqual(names("mine"), ["mine()", "my-stack"]);
});

test("your own things break a tie with jj's vocabulary", () => {
  // Both start with the query, so both score the same — and the row the user
  // made is the one they meant.
  assert.deepEqual(names("bookmark"), [
    "bookmarked",
    "bookmarks([pattern])",
    "remote_bookmarks([name_pattern])",
  ]);
});

test("every word has to hit, or the filter never narrows", () => {
  // Both words land on `remote_bookmarks(…)`'s name, and on `bookmarked`
  // through its expansion — which is the saved revset for exactly this, so
  // finding it here is the feature and not a leak.
  assert.deepEqual(names("remote bookmark"), [
    "remote_bookmarks([name_pattern])",
    "bookmarked",
  ]);
  assert.deepEqual(names("bookmark nonsense"), []);
});

test("an empty query is the reference list, your rows first", () => {
  assert.deepEqual(names("", 4), ["my-stack", "bookmarked", "main", "feature"]);
});

test("a function that takes an argument leaves its paren open", () => {
  const inserts = new Map(rows.map((row) => [row.name, row.insert]));
  assert.equal(inserts.get("bookmarks([pattern])"), "bookmarks(");
  assert.equal(inserts.get("mine()"), "mine()");
  // A bookmark name is quoted, because it reaches the revset as a name and not
  // as an expression — the same trust boundary `quote()` exists for.
  assert.equal(inserts.get("main"), 'bookmarks(exact:"main")');
});

test("choosing a row completes the word you are on", () => {
  assert.equal(insertIntoDraft("mine() & boo", "bookmarks("), "mine() & bookmarks(");
  assert.equal(insertIntoDraft("", "mine()"), "mine()");
  assert.equal(insertIntoDraft("mine() & ", "empty()"), "mine() & empty()");
  assert.equal(insertIntoDraft("~", "empty()"), "~empty()");
  // No word to complete and no operator to hang it on: the palette appends and
  // leaves the operator to the user rather than guessing `&` over `|`.
  assert.equal(insertIntoDraft("mine()", "empty()"), "mine() empty()");
});

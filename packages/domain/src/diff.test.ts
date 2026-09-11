import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allGroups,
  applySelectedGroups,
  pairRows,
  pairedWords,
  parseGitDiff,
  verifyRoundTrip,
  wordSpans,
} from "./diff.ts";

/** Build a unified diff the way `jj diff --git` does, for a fixture. */
function gitDiff(body: string): string {
  return body.replace(/^\n/, "");
}

const TWO_EDITS = gitDiff(`
diff --git a/a.txt b/a.txt
index a52ef2749c..9e511e5433 100644
--- a/a.txt
+++ b/a.txt
@@ -1,8 +1,8 @@
 l1
-l2
+HUNK1
 l3
 l4
 l5
 l6
-l7
+HUNK2
 l8
`);

const LEFT = "l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\n";
const RIGHT = "l1\nHUNK1\nl3\nl4\nl5\nl6\nHUNK2\nl8\n";

test("one jj hunk with two edits yields two selectable groups", () => {
  // This is the case that makes jj's own hunking unusable as a selection unit:
  // both edits arrive in a single @@ block.
  const [file] = parseGitDiff(TWO_EDITS);
  assert.ok(file);
  assert.equal(file.path, "a.txt");
  assert.equal(file.status, "modified");
  assert.equal(file.hunks.length, 1);
  const groups = allGroups(file);
  assert.equal(groups.length, 2);
  assert.equal(groups[0]!.oldStart, 2);
  assert.equal(groups[1]!.oldStart, 7);
  assert.deepEqual(
    groups.map((g) => [g.additions, g.deletions]),
    [
      [1, 1],
      [1, 1],
    ],
  );
});

test("selecting one group applies only that edit", () => {
  const [file] = parseGitDiff(TWO_EDITS);
  const groups = allGroups(file!);
  assert.equal(
    applySelectedGroups(LEFT, file!, new Set([groups[0]!.id])),
    "l1\nHUNK1\nl3\nl4\nl5\nl6\nl7\nl8\n",
  );
  assert.equal(
    applySelectedGroups(LEFT, file!, new Set([groups[1]!.id])),
    "l1\nl2\nl3\nl4\nl5\nl6\nHUNK2\nl8\n",
  );
});

test("the round-trip invariants hold", () => {
  const [file] = parseGitDiff(TWO_EDITS);
  assert.deepEqual(verifyRoundTrip(LEFT, RIGHT, file!), { ok: true });
});

test("a new file is one group and reconstructs from nothing", () => {
  const diff = gitDiff(`
diff --git a/c.txt b/c.txt
new file mode 100644
index 0000000000..3e757656cf
--- /dev/null
+++ b/c.txt
@@ -0,0 +1,2 @@
+new
+lines
`);
  const [file] = parseGitDiff(diff);
  assert.equal(file!.status, "added");
  const groups = allGroups(file!);
  assert.equal(groups.length, 1);
  assert.equal(applySelectedGroups("", file!, new Set()), "");
  assert.equal(applySelectedGroups("", file!, new Set([groups[0]!.id])), "new\nlines\n");
  assert.deepEqual(verifyRoundTrip("", "new\nlines\n", file!), { ok: true });
});

test("a deleted file reconstructs to empty when selected", () => {
  const diff = gitDiff(`
diff --git a/gone.txt b/gone.txt
deleted file mode 100644
index 3e757656cf..0000000000
--- a/gone.txt
+++ /dev/null
@@ -1,2 +0,0 @@
-bye
-now
`);
  const [file] = parseGitDiff(diff);
  assert.equal(file!.status, "removed");
  const groups = allGroups(file!);
  assert.equal(applySelectedGroups("bye\nnow\n", file!, new Set([groups[0]!.id])), "");
  assert.equal(applySelectedGroups("bye\nnow\n", file!, new Set()), "bye\nnow\n");
  assert.deepEqual(verifyRoundTrip("bye\nnow\n", "", file!), { ok: true });
});

test("multiple hunks far apart stay independent", () => {
  const left = Array.from({ length: 30 }, (_, i) => `line${i + 1}`).join("\n") + "\n";
  const diff = gitDiff(`
diff --git a/big.txt b/big.txt
--- a/big.txt
+++ b/big.txt
@@ -2,3 +2,3 @@
 line1
-line2
+TWO
 line3
@@ -25,3 +25,3 @@
 line24
-line25
+TWENTYFIVE
 line26
`);
  const [file] = parseGitDiff(diff);
  // Header counts start at line 2 and 25 but the bodies begin with context for
  // line1 / line24, which is the off-by-one this asserts against.
  const groups = allGroups(file!);
  assert.equal(groups.length, 2);
  const first = applySelectedGroups(left, file!, new Set([groups[0]!.id]));
  assert.ok(first.includes("TWO"), first.slice(0, 60));
  assert.ok(!first.includes("TWENTYFIVE"));
  assert.ok(first.includes("line25"));
  assert.equal(first.split("\n").filter(Boolean).length, 30);
});

test("no trailing newline on the new side is preserved", () => {
  const diff = gitDiff(`
diff --git a/t.txt b/t.txt
--- a/t.txt
+++ b/t.txt
@@ -1,2 +1,2 @@
 keep
-old
+new
\\ No newline at end of file
`);
  const [file] = parseGitDiff(diff);
  const groups = allGroups(file!);
  assert.equal(applySelectedGroups("keep\nold\n", file!, new Set([groups[0]!.id])), "keep\nnew");
  assert.equal(applySelectedGroups("keep\nold\n", file!, new Set()), "keep\nold\n");
  assert.deepEqual(verifyRoundTrip("keep\nold\n", "keep\nnew", file!), { ok: true });
});

test("a binary file is reported, not parsed into hunks", () => {
  const diff = gitDiff(`
diff --git a/img.png b/img.png
index 1111111..2222222 100644
Binary files a/img.png and b/img.png differ
`);
  const [file] = parseGitDiff(diff);
  assert.equal(file!.isBinary, true);
  assert.equal(file!.hunks.length, 0);
});

test("a rename carries both paths", () => {
  const diff = gitDiff(`
diff --git a/old/name.ts b/new/name.ts
similarity index 92%
rename from old/name.ts
rename to new/name.ts
`);
  const [file] = parseGitDiff(diff);
  assert.equal(file!.status, "renamed");
  assert.equal(file!.oldPath, "old/name.ts");
  assert.equal(file!.path, "new/name.ts");
});

test("several files in one diff are separated", () => {
  const [a, b] = parseGitDiff(TWO_EDITS + gitDiff(`
diff --git a/c.txt b/c.txt
new file mode 100644
--- /dev/null
+++ b/c.txt
@@ -0,0 +1,1 @@
+new
`));
  assert.equal(a!.path, "a.txt");
  assert.equal(b!.path, "c.txt");
  assert.equal(b!.status, "added");
});

test("verifyRoundTrip refuses when the left content does not match the diff", () => {
  const [file] = parseGitDiff(TWO_EDITS);
  // Left content from a different revision: the guard must catch it rather than
  // let a wrong tree be committed.
  const result = verifyRoundTrip("totally\nunrelated\n", RIGHT, file!);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /a\.txt/);
});

test("adjacent add and del lines form one group, not two", () => {
  const diff = gitDiff(`
diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1,4 +1,4 @@
 keep
-x
-y
+X
+Y
 tail
`);
  const [file] = parseGitDiff(diff);
  const groups = allGroups(file!);
  assert.equal(groups.length, 1, "a replacement is one decision, not two");
  assert.equal(groups[0]!.additions, 2);
  assert.equal(groups[0]!.deletions, 2);
  assert.equal(
    applySelectedGroups("keep\nx\ny\ntail\n", file!, new Set([groups[0]!.id])),
    "keep\nX\nY\ntail\n",
  );
});

test("pairRows puts the two versions of a replaced line on one row", () => {
  const [file] = parseGitDiff(
    gitDiff(`
diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1,5 +1,6 @@
 keep
-x
-y
+X
+Y
+Z
 tail
`),
  );
  const rows = pairRows(file!.hunks[0]!.lines);
  assert.deepEqual(
    rows.map((row) => [row.left?.text, row.right?.text]),
    [
      ["keep", "keep"],
      ["x", "X"],
      ["y", "Y"],
      // The longer side spills; nothing is dropped and nothing is invented.
      [undefined, "Z"],
      ["tail", "tail"],
    ],
  );
  // Every changed line still appears exactly once, on the side that owns it.
  const lines = file!.hunks[0]!.lines;
  assert.equal(
    rows.filter((row) => row.left?.kind === "del").length,
    lines.filter((line) => line.kind === "del").length,
  );
  assert.equal(
    rows.filter((row) => row.right?.kind === "add").length,
    lines.filter((line) => line.kind === "add").length,
  );
});

/** The invariant the renderer stands on: the spans put the line back together. */
function joined(spans: readonly { text: string }[]): string {
  return spans.map((span) => span.text).join("");
}

test("word spans narrow a rewrite to the part that moved", () => {
  const spans = wordSpans("const total = price * 2;", "const total = price * 3;");
  assert.ok(spans);
  assert.equal(joined(spans.old), "const total = price * 2;");
  assert.equal(joined(spans.new), "const total = price * 3;");
  assert.deepEqual(
    spans.old.filter((span) => span.changed).map((span) => span.text),
    ["2"],
  );
  assert.deepEqual(
    spans.new.filter((span) => span.changed).map((span) => span.text),
    ["3"],
  );
});

test("a shared opening alone is enough, and so is a shared ending", () => {
  const grown = wordSpans("fn(a)", "fn(a, b)")!;
  assert.equal(joined(grown.old), "fn(a)");
  assert.equal(joined(grown.new), "fn(a, b)");
  // Nothing was deleted, so the old side has no changed span to paint.
  assert.deepEqual(grown.old.filter((span) => span.changed), []);
  assert.deepEqual(
    grown.new.filter((span) => span.changed).map((span) => span.text),
    [", b"],
  );

  const prefixed = wordSpans("  return x;", "      return x;")!;
  assert.deepEqual(
    prefixed.new.filter((span) => span.changed).map((span) => span.text),
    ["      "],
  );
});

test("two lines with nothing in common get no word diff at all", () => {
  // The row's own tint already says "this line was replaced"; painting every
  // character on top of it adds a second claim that says nothing.
  assert.equal(wordSpans("alpha beta", "gamma delta"), undefined);
});

test("Hangul narrows per character, since there are no word gaps to split on", () => {
  const spans = wordSpans("사과를 먹었다", "사과를 먹는다")!;
  assert.equal(joined(spans.old), "사과를 먹었다");
  assert.equal(joined(spans.new), "사과를 먹는다");
  assert.deepEqual(
    spans.old.filter((span) => span.changed).map((span) => span.text),
    ["었"],
  );
});

test("paired words follow pairRows, and skip a line with no partner", () => {
  const file = parseGitDiff(
    gitDiff(`
diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1,3 +1,4 @@
 keep
-value = 1
+value = 2
+brand new line
 tail
`),
  )[0]!;
  const lines = file.hunks[0]!.lines;
  const spans = pairedWords(lines);

  const del = lines.find((line) => line.kind === "del")!;
  const rewritten = lines.find((line) => line.text === "value = 2")!;
  const orphan = lines.find((line) => line.text === "brand new line")!;

  assert.deepEqual(
    spans.get(del)!.filter((span) => span.changed).map((span) => span.text),
    ["1"],
  );
  assert.deepEqual(
    spans.get(rewritten)!.filter((span) => span.changed).map((span) => span.text),
    ["2"],
  );
  // An addition `pairRows` left unpartnered has no other version to compare to.
  assert.equal(spans.get(orphan), undefined);
  // Context lines never carry spans.
  for (const line of lines.filter((candidate) => candidate.kind === "context")) {
    assert.equal(spans.get(line), undefined);
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allGroups,
  applySelectedGroups,
  parseGitDiff,
  verifyRoundTrip,
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

import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  allGroups,
  applySelectedGroups,
  parseGitDiff,
  rebaseSetRevset,
  verifyRoundTrip,
  type PlanFile,
} from "@ukemi/domain";
import { JjCliAdapter } from "./adapter.ts";
import { nodeExec } from "./node-exec.ts";
import { nodePlanPreparer } from "./node-plan.ts";

/**
 * Contract tests for the P1 history-editing operations, against the real `jj`.
 *
 * The hunk-level tests are the important ones: they run jj's diff-editor
 * protocol end to end and then assert what landed in each resulting revision,
 * because the failure mode of a wrong plan is a silently corrupted commit
 * rather than an error.
 */

const ENV = { ...process.env, JJ_USER: "Ukemi Test", JJ_EMAIL: "test@ukemi.dev" };

let repo: string;
let jj: JjCliAdapter;

function raw(...args: string[]): string {
  return execFileSync("jj", ["--color=never", "--no-pager", "--quiet", "-R", repo, ...args], {
    cwd: repo,
    encoding: "utf8",
    env: ENV,
  });
}

/** Fresh repo per test: these all rewrite history, so they must not share one. */
beforeEach(() => {
  if (repo) rmSync(repo, { recursive: true, force: true });
  repo = mkdtempSync(join(tmpdir(), "ukemi-p1-"));
  execFileSync("jj", ["git", "init"], { cwd: repo, env: ENV, stdio: "ignore" });
  jj = new JjCliAdapter(repo, nodeExec("jj", repo), nodePlanPreparer);
});

after(() => {
  if (repo) rmSync(repo, { recursive: true, force: true });
});

/** Change ID of the revision whose description starts with `prefix`. */
async function idOf(prefix: string): Promise<string> {
  const found = (await jj.log("all()")).find((r) => r.description.startsWith(prefix));
  assert.ok(found, `no revision described "${prefix}"`);
  return found.changeId;
}

async function descriptions(): Promise<string[]> {
  return (await jj.log("all() ~ root()")).map((r) => r.description);
}

/** Paths touched by a revision, sorted. */
async function touched(rev: string): Promise<string[]> {
  return (await jj.diffSummary(rev)).map((f) => f.path).sort();
}

// ---------------------------------------------------------------- rebase ----

test("rebase moves a revision onto a new parent", async () => {
  writeFileSync(join(repo, "a.txt"), "a\n");
  raw("describe", "-m", "base");
  raw("bookmark", "create", "trunk", "-r", "@");
  raw("new", "-m", "A");
  raw("new", "-m", "B");
  raw("new", "trunk", "-m", "D");

  const b = await idOf("B");
  const d = await idOf("D");
  await jj.rebase("revision", b, d);

  const rebased = (await jj.log("all()")).find((r) => r.description === "B")!;
  assert.deepEqual(rebased.parents, [d], "B's parent should now be D");
});

test("the branch-mode revset matches what `rebase -b` actually moves", async () => {
  // rebaseSetRevset drives the drag preview's "N changes" counts, so a
  // mismatch here would mislabel how much history is about to move.
  writeFileSync(join(repo, "a.txt"), "a\n");
  raw("describe", "-m", "base");
  raw("bookmark", "create", "trunk", "-r", "@");
  raw("new", "-m", "A");
  raw("new", "-m", "B");
  raw("new", "-m", "C");
  raw("new", "trunk", "-m", "D");

  const b = await idOf("B");
  const d = await idOf("D");

  const predicted = (await jj.log(rebaseSetRevset("branch", b, d)))
    .map((r) => r.description)
    .sort();
  assert.deepEqual(predicted, ["A", "B", "C"]);

  assert.deepEqual(
    (await jj.log(rebaseSetRevset("revision", b, d))).map((r) => r.description),
    ["B"],
  );
  assert.deepEqual(
    (await jj.log(rebaseSetRevset("source", b, d))).map((r) => r.description).sort(),
    ["B", "C"],
  );

  await jj.rebase("branch", b, d);
  const a = (await jj.log("all()")).find((r) => r.description === "A")!;
  assert.deepEqual(a.parents, [d], "the whole branch should hang off D");
});

// ------------------------------------------------------- split by file ----

test("split by fileset puts the named files in the lower revision", async () => {
  raw("describe", "-m", "base");
  raw("new", "-m", "original");
  writeFileSync(join(repo, "a.txt"), "a\n");
  writeFileSync(join(repo, "b.txt"), "b\n");

  const rev = await idOf("original");
  await jj.split({ rev, paths: ["a.txt"], message: "just a" });

  assert.deepEqual(await descriptions(), ["original", "just a", "base"]);
  assert.deepEqual(await touched(await idOf("just a")), ["a.txt"]);
  assert.deepEqual(await touched(await idOf("original")), ["b.txt"]);
});

test("squash by fileset moves one file into the parent", async () => {
  raw("describe", "-m", "base");
  raw("new", "-m", "child");
  writeFileSync(join(repo, "a.txt"), "a\n");
  writeFileSync(join(repo, "b.txt"), "b\n");
  raw("status");

  const child = await idOf("child");
  const base = await idOf("base");
  await jj.squash({ from: child, into: base, paths: ["a.txt"] });

  assert.ok((await touched(await idOf("base"))).includes("a.txt"));
  assert.deepEqual(await touched(await idOf("child")), ["b.txt"]);
});

// ------------------------------------------------------ split by hunk ----

test("split by hunk keeps only the selected group in the lower revision", async () => {
  writeFileSync(join(repo, "a.txt"), "l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\n");
  raw("describe", "-m", "base");
  raw("new", "-m", "original");
  // Two independent edits that jj reports inside a single @@ block.
  writeFileSync(join(repo, "a.txt"), "l1\nHUNK1\nl3\nl4\nl5\nl6\nHUNK2\nl8\n");
  writeFileSync(join(repo, "c.txt"), "new\n");
  raw("status");

  const rev = await idOf("original");
  const parent = (await jj.show(rev))!.parents[0]!;
  const files = parseGitDiff(await jj.diff(rev));
  const aDiff = files.find((f) => f.path === "a.txt")!;

  const left = await jj.fileContent(parent, "a.txt");
  const right = await jj.fileContent(rev, "a.txt");
  // The guard that must hold before anything is written.
  assert.deepEqual(verifyRoundTrip(left, right, aDiff), { ok: true });

  const groups = allGroups(aDiff);
  assert.equal(groups.length, 2, "two edits must be two selectable groups");
  const keepFirstOnly = new Set([groups[0]!.id]);

  const plan: PlanFile[] = [
    { path: "a.txt", op: "write", content: applySelectedGroups(left, aDiff, keepFirstOnly) },
    // c.txt is new and unselected, so it must not exist in the lower revision.
    { path: "c.txt", op: "delete" },
  ];
  await jj.splitHunks({ rev, keep: plan, message: "only the first edit" });

  const lower = await idOf("only the first edit");
  assert.deepEqual(await touched(lower), ["a.txt"]);
  assert.equal(
    await jj.fileContent(lower, "a.txt"),
    "l1\nHUNK1\nl3\nl4\nl5\nl6\nl7\nl8\n",
    "the lower revision must carry the first edit and not the second",
  );

  const upper = await idOf("original");
  assert.deepEqual(await touched(upper), ["a.txt", "c.txt"]);
  assert.equal(await jj.fileContent(upper, "a.txt"), "l1\nHUNK1\nl3\nl4\nl5\nl6\nHUNK2\nl8\n");
});

test("a reverted file comes back from the left side, deletion and all", async () => {
  writeFileSync(join(repo, "keep.txt"), "original\n");
  writeFileSync(join(repo, "bin.dat"), " binary ");
  raw("describe", "-m", "base");
  raw("new", "-m", "original");
  // This change deletes one file and rewrites a binary one.
  rmSync(join(repo, "keep.txt"));
  writeFileSync(join(repo, "bin.dat"), " changed ");
  raw("status");

  const rev = await idOf("original");
  // Take neither: both revert, so the lower revision changes nothing at all.
  await jj.splitHunks({
    rev,
    keep: [
      { path: "keep.txt", op: "revert" },
      { path: "bin.dat", op: "revert" },
    ],
    message: "empty on purpose",
  });

  const lower = await idOf("empty on purpose");
  assert.deepEqual(await touched(lower), [], "reverting everything leaves nothing behind");
  // The deletion and the binary edit must both survive in the upper revision.
  assert.deepEqual(await touched(await idOf("original")), ["bin.dat", "keep.txt"]);
});

test("squash by hunk moves one edit into the parent and leaves the other", async () => {
  writeFileSync(join(repo, "a.txt"), "l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\n");
  raw("describe", "-m", "parent");
  raw("new", "-m", "child");
  writeFileSync(join(repo, "a.txt"), "l1\nX\nl3\nl4\nl5\nl6\nY\nl8\n");
  raw("status");

  const child = await idOf("child");
  const parent = await idOf("parent");
  const files = parseGitDiff(await jj.diff(child));
  const aDiff = files.find((f) => f.path === "a.txt")!;
  const left = await jj.fileContent(parent, "a.txt");
  const groups = allGroups(aDiff);

  await jj.squashHunks({
    from: child,
    into: parent,
    keep: [
      {
        path: "a.txt",
        op: "write",
        content: applySelectedGroups(left, aDiff, new Set([groups[0]!.id])),
      },
    ],
  });

  assert.equal(
    await jj.fileContent(await idOf("parent"), "a.txt"),
    "l1\nX\nl3\nl4\nl5\nl6\nl7\nl8\n",
  );
  assert.equal(
    await jj.fileContent(await idOf("child"), "a.txt"),
    "l1\nX\nl3\nl4\nl5\nl6\nY\nl8\n",
  );
});

test("a plan directory is removed even when jj fails", async () => {
  raw("describe", "-m", "base");
  const prepared: string[] = [];
  const spy = new JjCliAdapter(repo, nodeExec("jj", repo), async (files) => {
    const plan = await nodePlanPreparer(files);
    prepared.push(plan.planDir);
    return plan;
  });
  await assert.rejects(() =>
    spy.splitHunks({ rev: "no_such_revision", keep: [], message: "x" }),
  );
  assert.equal(prepared.length, 1);
  // The plan holds the user's file contents; a failed run must not leave it.
  assert.throws(() => readFileSync(join(prepared[0]!, "apply.sh")));
});

test("hunk operations are refused when the port has no plan preparer", async () => {
  const readOnly = new JjCliAdapter(repo, nodeExec("jj", repo));
  await assert.rejects(
    () => readOnly.splitHunks({ rev: "@", keep: [], message: "x" }),
    /PlanPreparer/,
  );
});

// ------------------------------------------------------------ conflicts ----

test("conflicts are listed and can be resolved by taking a side", async () => {
  writeFileSync(join(repo, "a.txt"), "base\n");
  raw("describe", "-m", "base");
  raw("bookmark", "create", "trunk", "-r", "@");
  raw("new", "-m", "ours");
  writeFileSync(join(repo, "a.txt"), "ours\n");
  raw("new", "trunk", "-m", "theirs");
  writeFileSync(join(repo, "a.txt"), "theirs\n");
  raw("status");

  const ours = await idOf("ours");
  const theirs = await idOf("theirs");
  await jj.rebase("revision", theirs, ours);

  const conflicted = (await jj.log("all()")).find((r) => r.hasConflict);
  assert.ok(conflicted, "the rebase should have produced a conflict");

  const conflictFiles = await jj.conflicts(conflicted.changeId);
  assert.equal(conflictFiles.length, 1);
  assert.equal(conflictFiles[0]!.path, "a.txt");
  assert.equal(conflictFiles[0]!.sides, 2, conflictFiles[0]!.description);

  await jj.resolveTakingSide(conflicted.changeId, "a.txt", "theirs");
  const after = (await jj.log("all()")).find((r) => r.changeId === conflicted.changeId)!;
  assert.equal(after.hasConflict, false, "taking a side must clear the conflict");
  assert.equal((await jj.conflicts(conflicted.changeId)).length, 0);
});

/**
 * The merge case, which is not the rebase case: `jj new a b` records the
 * conflict in a change that has no patch of its own, so `isEmpty` is true and
 * the diff is empty while `conflicts()` still names the file.
 *
 * The inspector reads exactly this: it offers "take a side" from the conflict
 * list and greys out "edit by hunk", because a hunk editor opened on an empty
 * diff shows nothing to resolve.
 */
test("a merge records its conflict with no diff of its own", async () => {
  writeFileSync(join(repo, "a.txt"), "base\n");
  raw("describe", "-m", "base");
  raw("bookmark", "create", "trunk", "-r", "@");
  raw("new", "-m", "ours");
  writeFileSync(join(repo, "a.txt"), "ours\n");
  raw("new", "trunk", "-m", "theirs");
  writeFileSync(join(repo, "a.txt"), "theirs\n");
  raw("status");

  await jj.newChange([await idOf("ours"), await idOf("theirs")]);

  const merge = (await jj.log("all()")).find((r) => r.hasConflict);
  assert.ok(merge, "merging the two sides should have produced a conflict");
  assert.equal(merge.parents.length, 2);
  assert.equal(merge.isEmpty, true, "a merge carries no change of its own");
  assert.deepEqual(await jj.diffSummary(merge.changeId), []);

  const files = await jj.conflicts(merge.changeId);
  assert.deepEqual(
    files.map((f) => f.path),
    ["a.txt"],
    "the conflict is listed even though the diff is empty",
  );

  await jj.resolveTakingSide(merge.changeId, "a.txt", "theirs");
  assert.equal(readFileSync(join(repo, "a.txt"), "utf8"), "theirs\n");
});

// ------------------------------------------- round-trip on real jj diffs ----

test("round-trip holds for a spread of real edits jj produced", async () => {
  // The parser's invariants are only worth anything against jj's actual output,
  // so this exercises adds, deletes, replacements, first/last-line edits and a
  // file with no trailing newline, all in one revision.
  writeFileSync(join(repo, "one.txt"), "1\n2\n3\n4\n5\n");
  writeFileSync(join(repo, "two.txt"), "keep\ndrop\n");
  writeFileSync(join(repo, "gone.txt"), "bye\n");
  writeFileSync(join(repo, "nonl.txt"), "no trailing newline");
  raw("describe", "-m", "base");
  raw("new", "-m", "edits");
  writeFileSync(join(repo, "one.txt"), "FIRST\n2\n3\n4\nLAST\nappended\n");
  writeFileSync(join(repo, "two.txt"), "keep\n");
  rmSync(join(repo, "gone.txt"));
  writeFileSync(join(repo, "nonl.txt"), "still no trailing newline");
  writeFileSync(join(repo, "added.txt"), "brand\nnew\n");
  raw("status");

  const rev = await idOf("edits");
  const parent = (await jj.show(rev))!.parents[0]!;
  const files = parseGitDiff(await jj.diff(rev));
  assert.ok(files.length >= 5, `expected several files, got ${files.length}`);

  for (const file of files) {
    if (file.isBinary) continue;
    const left = file.status === "added" ? "" : await jj.fileContent(parent, file.path);
    const right = file.status === "removed" ? "" : await jj.fileContent(rev, file.path);
    assert.deepEqual(
      verifyRoundTrip(left, right, file),
      { ok: true },
      `round-trip failed for ${file.path}`,
    );
  }
});

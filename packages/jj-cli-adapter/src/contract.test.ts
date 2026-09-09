import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { layoutGraph } from "@ukemi/domain";
import { JjCliAdapter } from "./adapter.ts";
import { nodeExec } from "./node-exec.ts";
import { JjError } from "./exec.ts";

/**
 * Contract test against the real `jj` on PATH.
 *
 * This is the test that matters: the templates in `templates.ts` are a wire
 * format owned by jj, and jj ships monthly. A template function that changes
 * shape shows up here as a parse failure instead of as a blank window, which is
 * the whole reason the adapter is worth isolating.
 */

let repo: string;
let jj: JjCliAdapter;

/** Run jj directly to arrange fixtures — deliberately not through the adapter. */
function raw(...args: string[]): string {
  return execFileSync("jj", ["--color=never", "--no-pager", "-R", repo, ...args], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, JJ_USER: "Ukemi Test", JJ_EMAIL: "test@ukemi.dev" },
  });
}

before(() => {
  repo = mkdtempSync(join(tmpdir(), "ukemi-contract-"));
  execFileSync("jj", ["git", "init", "--colocate"], {
    cwd: repo,
    env: { ...process.env, JJ_USER: "Ukemi Test", JJ_EMAIL: "test@ukemi.dev" },
  });

  // base ← feature, plus a second head so the graph has a fork to lay out.
  writeFileSync(join(repo, "a.txt"), "a\n");
  raw("describe", "-m", 'base: quotes " and 한글 and \\ backslash');
  raw("bookmark", "create", "trunk", "-r", "@");
  raw("new", "-m", "feature work");
  writeFileSync(join(repo, "b.txt"), "b\n");
  raw("bookmark", "create", "feature", "-r", "@");
  raw("new", "trunk", "-m", "second head");

  jj = new JjCliAdapter(
    repo,
    nodeExec("jj", repo),
  );
});

after(() => {
  if (repo) rmSync(repo, { recursive: true, force: true });
});

test("log parses every revision field", async () => {
  const revisions = await jj.log("all()");
  assert.ok(revisions.length >= 3);

  const base = revisions.find((r) => r.description.startsWith("base:"));
  assert.ok(base, "base change must be present");
  // Quotes, CJK and backslashes must survive json() round-tripping intact.
  assert.equal(base.description, 'base: quotes " and 한글 and \\ backslash');
  assert.equal(base.author.email, "test@ukemi.dev");
  assert.match(base.changeId, /^[k-z]{32}$/);
  assert.match(base.commitId, /^[0-9a-f]{40}$/);
  assert.deepEqual(base.bookmarks, ["trunk"]);
  assert.equal(base.hasConflict, false);
  assert.equal(typeof base.isEmpty, "boolean");
  assert.equal(typeof base.isImmutable, "boolean");
});

test("descriptions carry no trailing newline", async () => {
  for (const revision of await jj.log("all()")) {
    assert.ok(!revision.description.endsWith("\n"), revision.changeId);
  }
});

test("parents are change IDs and form a layout-able graph", async () => {
  const revisions = await jj.log("all()");
  const byId = new Map(revisions.map((r) => [r.changeId, r]));
  const feature = revisions.find((r) => r.description === "feature work");
  assert.ok(feature);
  assert.equal(feature.parents.length, 1);
  // A parent must resolve as a change ID within the same revset.
  assert.ok(byId.has(feature.parents[0]!), "parent must be a change ID in-set");

  const layout = layoutGraph(revisions);
  assert.equal(layout.rows.length, revisions.length);
  // Two heads on `trunk` means the layout must open a second lane.
  assert.ok(layout.laneCount >= 2, `expected a fork, got ${layout.laneCount} lane(s)`);
});

test("exactly one revision is the working copy", async () => {
  const revisions = await jj.log("all()");
  assert.equal(revisions.filter((r) => r.isWorkingCopy).length, 1);
});

test("bookmarks report local rows and remote tracking", async () => {
  const bookmarks = await jj.bookmarks();
  const trunk = bookmarks.find((b) => b.name === "trunk" && b.remote === undefined);
  assert.ok(trunk, "local trunk row must exist");
  assert.ok(trunk.target, "a present bookmark must have a target");
  assert.equal(trunk.hasConflict, false);
  // The colocated git remote makes a tracking row; ahead/behind must parse as
  // numbers, which is where the `tracked` guard in the template earns its place.
  for (const bookmark of bookmarks.filter((b) => b.ahead !== undefined)) {
    assert.equal(typeof bookmark.ahead, "number");
    assert.equal(typeof bookmark.behind, "number");
  }
});

test("operations parse, and exactly one is current", async () => {
  const operations = await jj.operations(20);
  assert.ok(operations.length >= 3);
  assert.equal(operations.filter((o) => o.isCurrent).length, 1);
  const first = operations[0]!;
  assert.match(first.id, /^[0-9a-f]{16,}$/);
  assert.ok(first.time.length > 0);
  // `attributes()` is where the real argv lives; the UI's transparency panel
  // shows it, so a shape change here must fail loudly.
  const withArgs = operations.find((o) => o.args !== undefined);
  assert.ok(withArgs, "at least one op must record its argv");
  assert.ok(withArgs.args!.startsWith("jj "), withArgs.args);
});

test("workspaces list the default workspace", async () => {
  const workspaces = await jj.workspaces();
  assert.deepEqual(
    workspaces.map((w) => w.name),
    ["default"],
  );
  assert.match(workspaces[0]!.changeId, /^[k-z]{32}$/);
});

test("diffSummary and diff read one revision's files", async () => {
  const feature = (await jj.log("all()")).find((r) => r.description === "feature work")!;
  const files = await jj.diffSummary(feature.changeId);
  assert.deepEqual(files, [{ path: "b.txt", status: "added" }]);

  const text = await jj.diff(feature.changeId, "b.txt");
  assert.match(text, /b\.txt/);
  assert.match(text, /^\+b$/m);
});

test("reads are pinned by --at-operation and ignore later writes", async () => {
  const before = await jj.currentOperation();
  const countBefore = (await jj.log("all()")).length;

  await jj.newChange(["@"], "written after the pin");

  // The pinned read must not see the new change; the live read must.
  const pinned = await jj.log("all()", { atOp: before });
  assert.equal(pinned.length, countBefore, "pinned read must not see later writes");
  assert.equal((await jj.log("all()")).length, countBefore + 1);
});

test("describe then undo round-trips, and each write reports its operation", async () => {
  const target = (await jj.log("all()")).find((r) => r.description === "feature work")!;

  const { opId } = await jj.describe(target.changeId, "renamed by contract test");
  assert.equal(opId, await jj.currentOperation());
  assert.equal(
    (await jj.show(target.changeId))?.description,
    "renamed by contract test",
  );

  await jj.undo();
  assert.equal((await jj.show(target.changeId))?.description, "feature work");
});

test("op restore rewinds the repo to an earlier operation", async () => {
  const pin = await jj.currentOperation();
  const countBefore = (await jj.log("all()")).length;

  await jj.newChange(["@"], "to be rewound");
  assert.equal((await jj.log("all()")).length, countBefore + 1);

  await jj.restoreOperation(pin);
  assert.equal((await jj.log("all()")).length, countBefore);
});

test("a bad revset fails as JjError carrying jj's own message", async () => {
  await assert.rejects(
    () => jj.log("no_such_function()"),
    (error: unknown) => {
      assert.ok(error instanceof JjError, `expected JjError, got ${error}`);
      assert.notEqual(error.code, 0);
      assert.match(error.message, /no_such_function|Revision|revset/i);
      return true;
    },
  );
});

test("a bookmark name with revset syntax cannot widen the revset", async () => {
  // `quote()` exists for exactly this: an unquoted `x | all()` would otherwise
  // be evaluated as an expression rather than matched as a name.
  const { bookmarkRevset } = await import("@ukemi/domain");
  const revisions = await jj.log(bookmarkRevset("trunk | all()"));
  assert.deepEqual(revisions, [], "a name that is not a bookmark must match nothing");
});

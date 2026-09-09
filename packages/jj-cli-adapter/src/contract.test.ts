import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { layoutGraph } from "@ukemi/domain";
import { JjCliAdapter } from "./adapter.ts";
import { nodeExec } from "./node-exec.ts"; // node-only entry; see index.ts
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
/** The bare repo the tracking test pushes to; created by that test alone. */
let bare: string | undefined;

// The adapter's own exec inherits this; without it jj warns about an empty
// identity on every write, which would drown the messages the tests read.
process.env.JJ_USER = "Ukemi Test";
process.env.JJ_EMAIL = "test@ukemi.dev";

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
  if (bare) rmSync(bare, { recursive: true, force: true });
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

test("every saved revset in the sidebar is valid jj syntax", async () => {
  // These are domain constants, but only jj can say whether they parse and
  // what they mean. A sidebar button bound to a broken revset is a dead button,
  // so the constants are verified here rather than trusted.
  const { CONFLICTS_REVSET, DEFAULT_REVSET, UNPUSHED_REVSET } = await import("@ukemi/domain");
  for (const revset of [DEFAULT_REVSET, CONFLICTS_REVSET, UNPUSHED_REVSET]) {
    await assert.doesNotReject(() => jj.log(revset), `revset failed: ${revset}`);
  }
});

test("the default revset shows every mutable head, not just bookmarked ones", async () => {
  const { DEFAULT_REVSET } = await import("@ukemi/domain");
  // `feature` is bookmarked; `second head` is not. An earlier default hid the
  // unbookmarked one, which is the regression this pins down.
  const shown = (await jj.log(DEFAULT_REVSET)).map((r) => r.description);
  assert.ok(
    shown.some((description) => description === "second head"),
    `unbookmarked head missing from default revset: ${JSON.stringify(shown)}`,
  );
});

test("a saved revset round-trips through jj's own config and then resolves", async () => {
  // The whole point of storing these as `revset-aliases` rather than as app
  // state: the name has to be a *revset* afterwards, not just a label the
  // sidebar remembers. So the test saves one, reads the list back, and then
  // asks jj to evaluate the name — including under `latest(…)`, which is how
  // `useLog` always wraps it.
  assert.deepEqual(await jj.revsetAliases(), [], "a fresh repo has no saved revsets");

  await jj.saveRevsetAlias("my-trunk", 'bookmarks(exact:"trunk")');
  assert.deepEqual(await jj.revsetAliases(), [
    { name: "my-trunk", revset: 'bookmarks(exact:"trunk")' },
  ]);

  const { withLimit } = await import("@ukemi/domain");
  const direct = await jj.log("my-trunk");
  assert.equal(direct.length, 1, "the alias name must resolve as a revset");
  await assert.doesNotReject(() => jj.log(withLimit("my-trunk", 10)));

  // Repo scope only: jj's built-ins (`trunk()`, `immutable_heads()`) come from
  // the defaults, and a list that included them would bury the user's own.
  const names = (await jj.revsetAliases()).map((alias) => alias.name);
  assert.deepEqual(names, ["my-trunk"]);

  await jj.deleteRevsetAlias("my-trunk");
  assert.deepEqual(await jj.revsetAliases(), []);
  await assert.rejects(() => jj.log("my-trunk"), "the name must stop resolving once forgotten");
});

test("an alias name that could widen a revset is refused before it reaches jj", async () => {
  // jj accepts `revset-aliases."a | all()"` without complaint, and the name
  // comes back out as a bare symbol inside an expression where it cannot be
  // quoted. `isAliasName` is the narrowing, and the adapter re-checks it
  // because this is the last point before the name enters an argv.
  for (const name of ["a | all()", "", "-x", "1", 'has"quote', "a b"]) {
    await assert.rejects(
      () => jj.saveRevsetAlias(name, "none()"),
      `accepted a name it should have refused: ${JSON.stringify(name)}`,
    );
  }
  // And a function alias someone wrote by hand is skipped rather than offered
  // as a row the sidebar could not safely click.
  raw("config", "set", "--repo", 'revset-aliases."mine-but(x)"', "none()");
  assert.deepEqual(await jj.revsetAliases(), []);
  raw("config", "unset", "--repo", 'revset-aliases."mine-but(x)"');
});

test("the revset functions the palette offers come from the real jj help", async () => {
  // `revset-help.test.ts` pins the parse against copied output; this pins it
  // against whatever jj is on PATH, which is the half that catches a jj that
  // reformatted its own documentation.
  const functions = await jj.revsetFunctions();
  assert.ok(functions.length > 40, `too few functions parsed: ${functions.length}`);

  const byName = new Map(functions.map((fn) => [fn.name, fn]));
  // The four the palette leans on hardest, and the only ones a rewrite of this
  // help page could plausibly drop without the count noticing.
  for (const name of ["mine", "bookmarks", "empty", "conflicts"]) {
    const fn = byName.get(name);
    assert.ok(fn, `missing from jj help: ${name}()`);
    assert.ok(fn.about.length > 0, `no description parsed for ${name}()`);
    // A sentence, not a wall: the row shows this in one line.
    assert.ok(fn.about.length < 200, `description not cut to a sentence: ${fn.about}`);
  }

  // Every name has to be callable as written, or a palette row inserts a
  // syntax error. jj is the only thing that can say so.
  for (const fn of functions.slice(0, 8)) {
    const revset = fn.params.length === 0 ? `${fn.name}()` : undefined;
    if (revset === undefined) continue;
    await assert.doesNotReject(() => jj.log(revset), `not a usable revset: ${revset}`);
  }
});

test("gitInfo sees the colocated .git and the committer field parses", async () => {
  const info = await jj.gitInfo();
  assert.equal(info.colocated, true, info.gitRoot);
  assert.ok(Array.isArray(info.remotes));
  const [head] = await jj.log("@");
  assert.ok(head!.committer.timestamp.length > 0);
});

test("absorb moves a line edit into the ancestor that last touched it", async () => {
  // A fresh stack on top of trunk: base edits a.txt; the child tweaks that line.
  raw("new", "trunk", "-m", "absorb-base");
  writeFileSync(join(repo, "z.txt"), "one\ntwo\n");
  raw("new", "-m", "absorb-child");
  writeFileSync(join(repo, "z.txt"), "ONE\ntwo\n");
  raw("status");
  const child = (await jj.log("all()")).find((r) => r.description === "absorb-child")!;
  const result = await jj.absorb(child.changeId);
  assert.ok(result.message && /absorb/i.test(result.message), result.message);
  const base = (await jj.log("all()")).find((r) => r.description === "absorb-base")!;
  assert.equal(await jj.fileContent(base.changeId, "z.txt"), "ONE\ntwo\n");
});

test("squash and split move whole files between revisions", async () => {
  // Its own three-file stack rather than the one the earlier tests left: the
  // assertions name where each file lands, so the change must start with a
  // known set of them.
  raw("new", "trunk", "-m", "files-parent");
  raw("new", "-m", "files-child");
  writeFileSync(join(repo, "sq-a.txt"), "a\n");
  writeFileSync(join(repo, "sq-b.txt"), "b\n");
  writeFileSync(join(repo, "sq-c.txt"), "c\n");
  raw("status"); // snapshot the working copy before anything reads change ids

  const at = async (desc: string) =>
    (await jj.log("all()")).find((r) => r.description === desc)!;
  const child = await at("files-child");
  const parent = await at("files-parent");

  await jj.squash({ from: child.changeId, into: parent.changeId, paths: ["sq-a.txt"] });
  assert.equal(await jj.fileContent(parent.changeId, "sq-a.txt"), "a\n");
  assert.deepEqual(
    (await jj.diffSummary(child.changeId)).map((f) => f.path).sort(),
    ["sq-b.txt", "sq-c.txt"],
    "only the named path may move to the parent",
  );

  // `split` keeps the original change id on the *lower* revision and mints a
  // new one for the upper, which is why the original id reads the lower half.
  await jj.split({ rev: child.changeId, paths: ["sq-b.txt"] });
  assert.deepEqual(
    (await jj.diffSummary(child.changeId)).map((f) => f.path),
    ["sq-b.txt"],
    "the named path belongs to the first revision",
  );
  const upper = await at("files-child");
  assert.notEqual(upper.changeId, child.changeId, "the description stays upstairs");
  assert.deepEqual(
    (await jj.diffSummary(upper.changeId)).map((f) => f.path),
    ["sq-c.txt"],
  );
});

test("tracking a remote-only bookmark mints the local one", async () => {
  // The state a fetch leaves behind for someone else's bookmark: jj's default
  // `git.auto-local-bookmark = false` imports the remote ref without making a
  // local bookmark for it. Reached here by pushing one and then dropping the
  // local side, which is the only way to arrange it in a single repo.
  bare = mkdtempSync(join(tmpdir(), "ukemi-remote-"));
  execFileSync("git", ["init", "--bare", "--quiet", bare]);
  raw("git", "remote", "add", "origin", bare);
  raw("bookmark", "create", "shared", "-r", "trunk");
  raw("git", "push", "--bookmark", "shared");
  raw("bookmark", "untrack", "shared@origin");
  raw("bookmark", "forget", "shared");

  const untracked = (await jj.bookmarks()).filter((b) => b.name === "shared");
  assert.deepEqual(
    untracked.map((b) => b.remote),
    ["origin"],
    "only the remote row may survive the forget",
  );
  // No counts is what marks the row untracked — the sidebar's whole test for
  // whether it should offer to track it.
  assert.equal(untracked[0]!.ahead, undefined);

  await jj.bookmarkTrack("shared", "origin");

  const tracked = (await jj.bookmarks()).filter((b) => b.name === "shared");
  assert.ok(
    tracked.some((b) => b.remote === undefined),
    "tracking must mint the local bookmark",
  );
  const remote = tracked.find((b) => b.remote === "origin");
  assert.equal(typeof remote?.ahead, "number");
  assert.equal(typeof remote?.behind, "number");
});

test("the observer sees each invocation with its argv and exit code", async () => {
  const seen: string[][] = [];
  const spy = new JjCliAdapter(repo, nodeExec("jj", repo), undefined, (record) => {
    seen.push([record.program, ...record.args]);
    assert.equal(record.code, 0);
  });
  await spy.currentOperation();
  assert.equal(seen.length, 1);
  assert.equal(seen[0]![0], "jj");
  assert.ok(seen[0]!.includes("op"));
});

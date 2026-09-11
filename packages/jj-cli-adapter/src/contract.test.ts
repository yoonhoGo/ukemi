import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { layoutGraph } from "@ukemi/domain";
import type { Revision } from "@ukemi/domain";
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

test("evolog reads a change's own history through the same revision shape", async () => {
  const before = (await jj.log("all()")).find((r) => r.description === "second head")!;
  await jj.describe(before.changeId, "second head, renamed");

  const history = await jj.evolog(before.changeId);
  // Newest first, and every entry is the same change wearing a different commit.
  assert.ok(history.length >= 2, `expected at least two versions, got ${history.length}`);
  assert.equal(history[0]!.description, "second head, renamed");
  assert.ok(
    history.some((entry) => entry.description === "second head"),
    "the pre-describe version must still be readable",
  );
  for (const entry of history) assert.equal(entry.changeId, before.changeId);
  assert.equal(new Set(history.map((entry) => entry.commitId)).size, history.length);
  // The template is `REVISION_TEMPLATE`'s body behind `commit.`, so every field
  // the log parses has to parse here too — that is the point of sharing it.
  assert.match(history[0]!.commitId, /^[0-9a-f]{40}$/);
  assert.equal(history[0]!.author.email, "test@ukemi.dev");
  assert.equal(typeof history[0]!.isEmpty, "boolean");
  assert.equal(typeof history[0]!.isImmutable, "boolean");
  assert.deepEqual(history[0]!.parents, before.parents);

  await jj.undo();
});

test("workspaces list the default workspace", async () => {
  const workspaces = await jj.workspaces();
  assert.deepEqual(
    workspaces.map((w) => w.name),
    ["default"],
  );
  assert.match(workspaces[0]!.changeId, /^[k-z]{32}$/);
});

test("tags list is empty on a fresh repo and parses once git has one", async () => {
  assert.deepEqual(await jj.tags(), []);
  // jj 0.43 has no `jj tag create`; a tag arrives through the colocated git.
  const base = (await jj.log("all()")).find((r) => r.description.startsWith("base"))!;
  execFileSync("git", ["tag", "v1", base.commitId], { cwd: repo });
  raw("git", "import");
  const tags = await jj.tags();
  assert.deepEqual(tags.map((tag) => tag.name), ["v1"]);
  assert.match(tags[0]!.target!, /^[k-z]{32}$/);
  assert.equal((await jj.log(`tags(exact:"v1")`)).length, 1);
});

test("annotate names the change behind each line", async () => {
  const feature = (await jj.log("all()")).find((r) => r.description === "feature work")!;
  const lines = await jj.annotate(feature.changeId, "b.txt");
  assert.deepEqual(
    lines.map((line) => [line.changeId, line.lineNumber, line.firstInHunk, line.subject, line.content]),
    [[feature.changeId, 1, true, "feature work", "b"]],
  );
  assert.equal(lines[0]!.author.email, "test@ukemi.dev");
});

test("diffSummary and diff read one revision's files", async () => {
  const feature = (await jj.log("all()")).find((r) => r.description === "feature work")!;
  const files = await jj.diffSummary(feature.changeId);
  assert.deepEqual(files, [{ path: "b.txt", status: "added" }]);

  const text = await jj.diff(feature.changeId, "b.txt");
  assert.match(text, /b\.txt/);
  assert.match(text, /^\+b$/m);
});

test("interdiff compares patches, not contents, across different parents", async () => {
  // The point of the command, as jj's own help puts it: two changes that *do*
  // the same thing on different bases have no interdiff, even though their
  // trees differ by everything the bases differ by.
  raw("new", "trunk", "-m", "inter-base");
  writeFileSync(join(repo, "inter-base.txt"), "base only\n");
  raw("status");
  const base = (await jj.log("@"))[0]!;

  // The same description on both, because jj counts a description change as
  // part of the interdiff and emits it as a synthetic `JJ-COMMIT-DESCRIPTION`
  // file. That is wanted in the window — "what changed since I pushed"
  // includes the message — but it would muddy the claim this line is making.
  raw("new", "trunk", "-m", "inter-same");
  writeFileSync(join(repo, "inter-feat.txt"), "hello\n");
  raw("status");
  const a = (await jj.log("@"))[0]!;

  raw("new", base.changeId, "-m", "inter-same");
  writeFileSync(join(repo, "inter-feat.txt"), "hello\n");
  raw("status");
  const b = (await jj.log("@"))[0]!;

  assert.equal(
    (await jj.interdiff({ from: a.changeId, to: b.changeId })).trim(),
    "",
    "same patch and same description on different parents is no interdiff at all",
  );

  // And the description *is* part of it when it differs.
  raw("describe", "-r", b.changeId, "-m", "inter-renamed");
  assert.match(
    await jj.interdiff({ from: a.changeId, to: b.changeId }),
    /JJ-COMMIT-DESCRIPTION/,
  );
  raw("describe", "-r", b.changeId, "-m", "inter-same");

  // Change what B does, and the interdiff is exactly that.
  writeFileSync(join(repo, "inter-feat.txt"), "hello, world\n");
  raw("status");
  const changed = await jj.interdiff({ from: a.changeId, to: b.changeId });
  assert.match(changed, /inter-feat\.txt/);
  assert.match(changed, /^\+hello, world$/m);
  // `inter-base.txt` is the difference between the two *parents*, which is
  // what `jj diff --from --to` would have dragged in and interdiff must not.
  assert.doesNotMatch(changed, /inter-base\.txt/);

  raw("abandon", "-r", `${a.changeId} | ${b.changeId} | ${base.changeId}`);
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

  // `jj redo` is the counterpart the window binds to ⌘⇧Z. Undone again at
  // the end, so the fixture leaves this test exactly as it found it.
  await jj.redo();
  assert.equal(
    (await jj.show(target.changeId))?.description,
    "renamed by contract test",
  );
  await jj.undo();
  assert.equal((await jj.show(target.changeId))?.description, "feature work");
});

test("op diff names the change an operation touched", async () => {
  const target = (await jj.log("all()")).find((r) => r.description === "feature work")!;
  const { opId } = await jj.describe(target.changeId, "described for op diff");

  // Not parsed anywhere — the timeline shows this text verbatim — so the
  // contract is only that `--op` still selects an operation and that jj says
  // which change moved. A silent empty string is the failure worth catching.
  const text = await jj.operationDiff(opId);
  assert.ok(text.trim().length > 0, "op diff must say something");
  assert.ok(
    text.includes(target.changeId.slice(0, 8)),
    `op diff should name the change it touched:\n${text}`,
  );

  await jj.undo();
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
  const {
    BOOKMARKS_REVSET,
    CONFLICTS_REVSET,
    DEFAULT_REVSET,
    EMPTY_REVSET,
    REACHABLE_REVSET,
    TAGS_REVSET,
    UNPUSHED_REVSET,
    WORKSPACES_REVSET,
  } = await import("@ukemi/domain");
  for (const revset of [
    DEFAULT_REVSET,
    CONFLICTS_REVSET,
    UNPUSHED_REVSET,
    REACHABLE_REVSET,
    BOOKMARKS_REVSET,
    TAGS_REVSET,
    WORKSPACES_REVSET,
    EMPTY_REVSET,
  ]) {
    await assert.doesNotReject(() => jj.log(revset), `revset failed: ${revset}`);
  }
});

test("search and file-history revsets resolve, and a quote cannot break them", async () => {
  const { fileHistoryRevset, searchRevset } = await import("@ukemi/domain");
  // Author, message and a resolvable name each hit; a name jj cannot resolve
  // is an empty set rather than an error, which is what `present` is for.
  assert.ok((await jj.log(searchRevset("feature"))).length >= 1, "message or bookmark");
  assert.ok((await jj.log(searchRevset("UKEMI TEST"))).length >= 1, "author, case-insensitive");
  assert.deepEqual(await jj.log(searchRevset('no such " thing')), []);
  assert.equal((await jj.log(fileHistoryRevset("b.txt"))).length, 1);
  assert.deepEqual(await jj.log(fileHistoryRevset('odd " name.txt')), []);
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

test("a remote can be added from inside, and gitInfo sees it", async () => {
  const before = (await jj.gitInfo()).remotes.map((remote) => remote.name);
  assert.equal(before.includes("extra"), false);

  await jj.addRemote("extra", "https://example.invalid/o/r.git");

  const after = (await jj.gitInfo()).remotes;
  const added = after.find((remote) => remote.name === "extra");
  assert.ok(added, `expected an "extra" remote, got ${after.map((r) => r.name).join(", ")}`);
  assert.equal(added.url, "https://example.invalid/o/r.git");

  // Removed again: later tests count the remotes this repo has.
  raw("git", "remote", "remove", "extra");
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

test("restore takes one file back to the parent and leaves the rest alone", async () => {
  raw("new", "trunk", "-m", "two files, one to keep");
  writeFileSync(join(repo, "keep.txt"), "keep\n");
  writeFileSync(join(repo, "drop.txt"), "drop\n");
  // Adapter reads carry `--ignore-working-copy`, so nothing on disk is in the
  // change until some command snapshots it.
  raw("status");
  const rev = (await jj.log("@"))[0]!;
  assert.equal((await jj.diffSummary(rev.changeId)).length, 2);

  await jj.restoreFiles({ rev: rev.changeId, paths: ["drop.txt"] });

  const left = await jj.diffSummary(rev.changeId);
  assert.deepEqual(left.map((file) => file.path), ["keep.txt"]);
  // The change itself survives: same ID, same description, one file lighter.
  const after = (await jj.show(rev.changeId))!;
  assert.equal(after.description, "two files, one to keep");
  assert.equal(existsSync(join(repo, "drop.txt")), false);
  assert.equal(existsSync(join(repo, "keep.txt")), true);

  // An empty path list is the whole revision, so the adapter refuses it before
  // jj ever sees the argv.
  await assert.rejects(() => jj.restoreFiles({ rev: rev.changeId, paths: [] }));

  raw("abandon", "-r", rev.changeId);
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

  // With the two sides agreeing, the remote name is noise and jj folds it away
  // — the same folding that keeps `@git` out of a colocated repo's rows.
  const carrying = async (name: string, pick: (r: Revision) => readonly string[]) =>
    (await jj.log("all()")).filter((r) => pick(r).includes(name));
  assert.deepEqual(await carrying("shared@origin", (r) => r.remoteBookmarks), []);

  // Now drive them apart, which is the case the graph could not draw: both
  // rows used to arrive as a bare `shared`, on two different revisions.
  raw("bookmark", "set", "shared", "-r", "@", "--allow-backwards");
  const local = await carrying("shared", (r) => r.bookmarks);
  const drifted = await carrying("shared@origin", (r) => r.remoteBookmarks);
  assert.equal(local.length, 1);
  assert.equal(drifted.length, 1);
  assert.notEqual(local[0]!.changeId, drifted[0]!.changeId);
  assert.ok(
    !drifted[0]!.bookmarks.includes("shared"),
    "the remote row must not arrive as a bare local name",
  );

  // The state the user's own repo is in: an *untracked* remote sitting on the
  // same change as its local. jj's own folding does not cover this one — it
  // only drops a tracked remote — so the adapter has to, or the graph draws
  // `shared` and `shared@origin` on the same revision.
  raw("bookmark", "untrack", "shared@origin");
  raw("bookmark", "set", "shared", "-r", "trunk", "--allow-backwards");
  const reunited = await carrying("shared", (r) => r.bookmarks);
  assert.equal(reunited.length, 1);
  assert.deepEqual(
    reunited[0]!.remoteBookmarks,
    [],
    "an untracked remote on the local's own revision is the local, not a second name",
  );
});

test("naming a bookmark pushes one the remote has never had, and tracks it", async () => {
  // The state `jj git push` on its own will not leave: its default set is the
  // tracking bookmarks, so a name that has never been pushed comes back as
  // "Refusing to create new remote bookmark". `--bookmark` is what sends it,
  // and jj tracks it on the way — the sidebar's Push button rests on both
  // halves of that, and a jj bump that took either away would show up here.
  const fresh = mkdtempSync(join(tmpdir(), "ukemi-fresh-"));
  try {
    execFileSync("git", ["init", "--bare", "--quiet", fresh]);
    raw("git", "remote", "add", "fresh", fresh);
    raw("bookmark", "create", "brand-new", "-r", "feature");

    // Colocated, so jj reports a `git` row for it with counts of 0 the moment
    // it exists. That row is why the sidebar cannot read counts as "pushed":
    // this repo is the fixture for `localBookmarks` skipping the git remote.
    const before = (await jj.bookmarks()).filter((b) => b.name === "brand-new");
    assert.deepEqual(
      before.map((b) => b.remote),
      [undefined, "git"],
      "only the local row and the colocated git repo may have it yet",
    );
    assert.equal(before.find((b) => b.remote === "git")?.ahead, 0);

    await jj.push({ remote: "fresh", bookmarks: ["brand-new"] });

    const after = (await jj.bookmarks()).filter((b) => b.name === "brand-new");
    const pushed = after.find((b) => b.remote === "fresh");
    assert.equal(pushed?.ahead, 0, "the remote must now have the bookmark");
    assert.equal(pushed?.behind, 0, "and pushing must have tracked it");

    // Which way jj counts, pinned: the local bookmark drops to trunk while the
    // remote stays where it was, so the remote is one commit ahead of the
    // local. jj reports that as `ahead` *on the remote row* — which is why the
    // sidebar swaps the pair when it folds the row onto the local one. A jj
    // that ever flipped this would turn every ↑ in the window into a ↓.
    raw("bookmark", "set", "brand-new", "-r", "trunk", "--allow-backwards");
    const moved = (await jj.bookmarks()).find(
      (b) => b.name === "brand-new" && b.remote === "fresh",
    );
    assert.equal(moved?.ahead, 1, "the remote row counts what the remote has");
    assert.equal(moved?.behind, 0);
  } finally {
    raw("bookmark", "forget", "brand-new");
    raw("git", "remote", "remove", "fresh");
    rmSync(fresh, { recursive: true, force: true });
  }
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

// Last in the file on purpose: a second workspace means a second working-copy
// commit, and the tests above count those.
test("a workspace is added at a path and forgotten by name, leaving the folder", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ukemi-workspace-"));
  try {
    await jj.addWorkspace(dir, "second");
    assert.deepEqual(
      (await jj.workspaces()).map((w) => w.name),
      ["default", "second"],
    );
    await jj.forgetWorkspace("second");
    assert.deepEqual(
      (await jj.workspaces()).map((w) => w.name),
      ["default"],
    );
    // jj only stops tracking it; what the user has on disk is their own.
    assert.ok(existsSync(join(dir, ".jj")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

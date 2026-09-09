import { test } from "node:test";
import assert from "node:assert/strict";
import { lookup, ROSETTA, searchTerms } from "./rosetta.ts";

const first = (query: string): string | undefined => lookup(query)[0]?.git;

test("the command a switcher types finds its own row", () => {
  assert.equal(first("git stash"), "git stash");
  assert.equal(first("git reflog"), "git reflog");
  assert.equal(first("git worktree add ../hotfix"), "git worktree add <path>");
});

test("a fuller command beats the shorter row it shares a word with", () => {
  assert.equal(first("git commit -m 'wip'"), 'git commit -m "…"');
  assert.equal(first("git commit --amend"), "git commit --amend");
  assert.equal(first("git rebase --abort"), "git rebase --abort");
});

test("a commit message is not a search query", () => {
  // Without dropping quoted text, the words of a message would score against
  // the table and could outrank the command itself.
  assert.deepEqual(searchTerms('git commit -m "revert the stash worktree"'), ["commit", "-m"]);
  assert.equal(first('git commit -m "revert the stash worktree"'), 'git commit -m "…"');
});

test("git spellings that are not the row's title still find it", () => {
  assert.equal(first("git switch -c feat/x"), "git checkout -b feat/x");
  assert.equal(first("git push -f"), "git push --force");
  assert.equal(first("git checkout -- ."), "git clean -fd");
});

test("nothing typed yet shows the whole sheet in its authored order", () => {
  assert.deepEqual(lookup(""), ROSETTA);
  assert.deepEqual(lookup("   "), ROSETTA);
  assert.equal(lookup("", 3).length, 3);
});

test("a query that matches nothing returns nothing rather than the whole table", () => {
  assert.deepEqual(lookup("zzzz"), []);
  // A bare `git` is not a term, so it must not be read as "match everything".
  assert.deepEqual(searchTerms("git"), []);
  assert.deepEqual(lookup("git"), ROSETTA);
});

test("every row answers with something to press or something to run", () => {
  for (const entry of ROSETTA) {
    assert.ok(
      entry.steps.length > 0 || entry.runs.length > 0,
      `${entry.git} offers no answer at all`,
    );
    assert.ok(entry.runs.every((run) => run.startsWith("jj ")), `${entry.git} runs a non-jj command`);
    assert.ok(entry.why.length > 0, `${entry.git} does not say why it differs`);
  }
});

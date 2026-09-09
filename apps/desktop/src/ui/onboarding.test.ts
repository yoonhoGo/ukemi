import { test } from "node:test";
import assert from "node:assert/strict";
import type { CommandRecord } from "@ukemi/domain";
import {
  acknowledge,
  hasGraduated,
  MILESTONES,
  MILESTONE_COUNT,
  milestoneForCommand,
  NO_PROGRESS,
  pendingHint,
  reach,
  reachedCount,
  type Progress,
} from "./onboarding.ts";

const reachAll = (ids: readonly string[]): Progress =>
  ids.reduce<Progress>((progress, id) => reach(progress, id), NO_PROGRESS);

test("a milestone is reached once, no matter how often it happens", () => {
  const once = reach(NO_PROGRESS, "working-copy");
  const twice = reach(once, "working-copy");
  assert.equal(twice, once, "re-reaching must not produce new state");
  assert.deepEqual(once.reached, ["working-copy"]);
});

test("an unknown id changes nothing, so a renamed milestone cannot corrupt progress", () => {
  assert.equal(reach(NO_PROGRESS, "git-add-p"), NO_PROGRESS);
  assert.equal(reachedCount({ ...NO_PROGRESS, reached: ["gone", "working-copy"] }), 1);
});

test("the pending hint is the one the user just caused, not the oldest unread", () => {
  const progress = reachAll(["working-copy", "describe", "undo"]);
  assert.equal(pendingHint(progress)?.id, "undo");
  // Dismissing the newest falls back to the next most recent, not to the first.
  assert.equal(pendingHint(acknowledge(progress, "undo"))?.id, "describe");
});

test("acknowledging retires a hint for good, and reaching again does not reopen it", () => {
  const acked = acknowledge(reach(NO_PROGRESS, "working-copy"), "working-copy");
  assert.equal(pendingHint(acked), undefined);
  assert.equal(pendingHint(reach(acked, "working-copy")), undefined);
});

test("hints off silences the bubble but keeps counting progress", () => {
  const progress = { ...reachAll(["working-copy", "undo"]), hintsOff: true };
  assert.equal(pendingHint(progress), undefined);
  assert.equal(reachedCount(progress), 2);
});

test("graduation needs all seven done, and the panel and the coach agree on the number", () => {
  const ids = MILESTONES.map((entry) => entry.id);
  assert.equal(ids.length, MILESTONE_COUNT);
  assert.equal(hasGraduated(reachAll(ids.slice(0, -1))), false);
  assert.equal(hasGraduated(reachAll(ids)), true);
});

test("every milestone carries the copy the bubble and the panel each need", () => {
  const ids = new Set<string>();
  for (const entry of MILESTONES) {
    assert.equal(ids.has(entry.id), false, `duplicate milestone id ${entry.id}`);
    ids.add(entry.id);
    assert.match(entry.replaces, /^git /, `${entry.id} must name the git command it replaces`);
    assert.ok(entry.title.length > 0 && entry.body.length > 0, `${entry.id} has no hint`);
  }
});

const ran = (args: readonly string[], code = 0, program = "jj"): CommandRecord => ({
  program,
  args,
  code,
  stderr: "",
  startedAt: "2026-09-09T12:00:00.000Z",
  durationMs: 4,
});

test("a jj verb ticks the habit it replaced, whichever button ran it", () => {
  assert.equal(milestoneForCommand(ran(["new", "@"])), "working-copy");
  assert.equal(milestoneForCommand(ran(["describe", "qp", "-m", "x"])), "describe");
  assert.equal(milestoneForCommand(ran(["undo"])), "undo");
  assert.equal(milestoneForCommand(ran(["op", "restore", "abc"])), "undo");
  assert.equal(milestoneForCommand(ran(["split", "-r", "qp"])), "hunks");
  assert.equal(milestoneForCommand(ran(["squash", "--from", "a", "--into", "b"])), "hunks");
  assert.equal(milestoneForCommand(ran(["absorb", "--from", "qp"])), "hunks");
  assert.equal(milestoneForCommand(ran(["workspace", "add", "../hotfix"])), "workspaces");
});

test("both ways a name lands on a commit reach the bookmark habit", () => {
  assert.equal(milestoneForCommand(ran(["bookmark", "set", "feat/x"])), "bookmarks");
  assert.equal(milestoneForCommand(ran(["git", "push", "--change", "qp"])), "bookmarks");
  // Deleting a name teaches nothing about how it got there.
  assert.equal(milestoneForCommand(ran(["bookmark", "delete", "feat/x"])), undefined);
});

test("a command that failed taught nothing", () => {
  assert.equal(milestoneForCommand(ran(["new", "@"], 1)), undefined);
  assert.equal(milestoneForCommand(ran(["git", "push"], 1)), undefined);
});

test("reads and other programs are not milestones", () => {
  assert.equal(milestoneForCommand(ran(["log", "-r", "@", "--ignore-working-copy"])), undefined);
  assert.equal(milestoneForCommand(ran(["op", "log", "--ignore-working-copy"])), undefined);
  assert.equal(milestoneForCommand(ran(["pr", "list"], 0, "gh")), undefined);
  assert.equal(milestoneForCommand(ran(["git", "init", "--colocate"])), undefined);
});

test("every command milestone is a real one, so the map cannot drift from the list", () => {
  const ids = new Set(MILESTONES.map((entry) => entry.id));
  for (const argv of [
    ["new"],
    ["describe"],
    ["undo"],
    ["op", "restore"],
    ["split"],
    ["bookmark", "set"],
    ["git", "push"],
    ["workspace", "add"],
  ]) {
    const id = milestoneForCommand(ran(argv));
    assert.ok(id && ids.has(id), `${argv.join(" ")} maps to ${String(id)}`);
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { GhCliAdapter, githubSlug, rollUpChecks } from "./gh.ts";

test("githubSlug reads every URL shape gh accepts and rejects other hosts", () => {
  assert.equal(githubSlug("https://github.com/jj-vcs/jj.git"), "jj-vcs/jj");
  assert.equal(githubSlug("https://github.com/jj-vcs/jj"), "jj-vcs/jj");
  assert.equal(githubSlug("git@github.com:jj-vcs/jj.git"), "jj-vcs/jj");
  assert.equal(githubSlug("ssh://git@github.com/jj-vcs/jj"), "jj-vcs/jj");
  assert.equal(githubSlug("https://gitlab.com/a/b.git"), undefined);
});

test("pull requests map gh's JSON onto the domain shape", async () => {
  const calls: string[][] = [];
  const gh = new GhCliAdapter("o/r", async (args) => {
    calls.push([...args]);
    return {
      code: 0,
      stderr: "",
      stdout: JSON.stringify([
        {
          number: 7, title: "t", state: "MERGED", url: "u", headRefName: "push-x",
          baseRefName: "main", isDraft: false, reviewDecision: "",
          statusCheckRollup: [
            { __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" },
          ],
        },
      ]),
    };
  });
  const prs = await gh.pullRequests();
  assert.equal(prs[0]!.state, "merged");
  assert.equal(prs[0]!.headBranch, "push-x");
  assert.ok(calls[0]!.includes("o/r"), "every call names the repo explicitly");
  assert.equal(prs[0]!.checks, "passing");
  assert.ok(
    calls[0]!.some((arg) => arg.includes("statusCheckRollup")),
    "the list read has to ask for the checks it reports",
  );
});

test("checks roll up to one word, and a failure outranks anything running", () => {
  assert.equal(rollUpChecks(null), "none");
  assert.equal(rollUpChecks([]), "none");
  assert.equal(
    rollUpChecks([{ __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" }]),
    "passing",
  );
  // A skipped job opted out; it did not say no. Counting it red would paint
  // most monorepo PRs red forever.
  assert.equal(
    rollUpChecks([
      { __typename: "CheckRun", status: "COMPLETED", conclusion: "SKIPPED" },
      { __typename: "CheckRun", status: "COMPLETED", conclusion: "NEUTRAL" },
    ]),
    "passing",
  );
  assert.equal(
    rollUpChecks([{ __typename: "CheckRun", status: "IN_PROGRESS", conclusion: null }]),
    "pending",
  );
  assert.equal(
    rollUpChecks([
      { __typename: "CheckRun", status: "IN_PROGRESS", conclusion: null },
      { __typename: "CheckRun", status: "COMPLETED", conclusion: "FAILURE" },
    ]),
    "failing",
    "a settled red outranks a run that has not finished",
  );
  // The older commit-status API has no `status`, only `state`.
  assert.equal(rollUpChecks([{ __typename: "StatusContext", state: "PENDING" }]), "pending");
  assert.equal(rollUpChecks([{ __typename: "StatusContext", state: "ERROR" }]), "failing");
  assert.equal(rollUpChecks([{ __typename: "StatusContext", state: "SUCCESS" }]), "passing");
});

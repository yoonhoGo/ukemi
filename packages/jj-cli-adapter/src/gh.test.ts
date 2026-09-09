import { test } from "node:test";
import assert from "node:assert/strict";
import { GhCliAdapter, githubSlug } from "./gh.ts";

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
        },
      ]),
    };
  });
  const prs = await gh.pullRequests();
  assert.equal(prs[0]!.state, "merged");
  assert.equal(prs[0]!.headBranch, "push-x");
  assert.ok(calls[0]!.includes("o/r"), "every call names the repo explicitly");
});

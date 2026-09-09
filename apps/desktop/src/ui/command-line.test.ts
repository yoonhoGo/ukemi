import { test } from "node:test";
import assert from "node:assert/strict";
import { isRead, shellLine } from "./command-line.ts";

const at = { code: 0, stderr: "", startedAt: "", durationMs: 0 };

test("shellLine quotes only what a shell would mangle", () => {
  assert.equal(
    shellLine({ program: "jj", args: ["describe", "-m", "fix: it's done", "-r", "@"] }),
    "jj describe -m 'fix: it'\\''s done' -r @",
  );
});

test("isRead separates jj reads and gh listings from writes", () => {
  assert.ok(isRead({ ...at, program: "jj", args: ["--ignore-working-copy", "log"] }));
  assert.ok(!isRead({ ...at, program: "jj", args: ["absorb"] }));
  assert.ok(isRead({ ...at, program: "gh", args: ["pr", "list"] }));
  assert.ok(!isRead({ ...at, program: "gh", args: ["pr", "create"] }));
});

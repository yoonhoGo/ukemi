import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { PLAN_TOOL_SCRIPT, type PlanPreparer, type PreparedPlan } from "./hunk-plan.ts";

/**
 * `PlanPreparer` backed by node:fs, for tests and scripts.
 *
 * The desktop app uses the Tauri command instead, since a webview cannot write
 * files. Both materialise the identical `PLAN_TOOL_SCRIPT`, so the protocol
 * lives in one place and only the plumbing differs.
 */
export const nodePlanPreparer: PlanPreparer = async (files) => {
  const planDir = await mkdtemp(join(tmpdir(), "ukemi-plan-"));
  const scriptPath = join(planDir, "apply.sh");
  await writeFile(scriptPath, PLAN_TOOL_SCRIPT, { mode: 0o755 });

  const deletions: string[] = [];
  const reverts: string[] = [];
  for (const file of files) {
    if (file.op === "delete") {
      deletions.push(file.path);
    } else if (file.op === "revert") {
      reverts.push(file.path);
    } else {
      const target = join(planDir, "write", file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content, "utf8");
    }
  }
  if (deletions.length > 0) {
    await writeFile(join(planDir, "DELETE"), `${deletions.join("\n")}\n`, "utf8");
  }
  if (reverts.length > 0) {
    await writeFile(join(planDir, "REVERT"), `${reverts.join("\n")}\n`, "utf8");
  }

  return {
    planDir,
    scriptPath,
    dispose: () => rm(planDir, { recursive: true, force: true }),
  } satisfies PreparedPlan;
};

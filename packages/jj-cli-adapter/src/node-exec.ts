import { execFile } from "node:child_process";
import type { ExecResult, JjExec } from "./exec.ts";

/**
 * `JjExec` backed by `child_process`. For tests and scripts — the desktop app
 * uses the Tauri shell instead, since a webview cannot spawn.
 *
 * ponytail: 8 MB output cap. A `jj diff` on a giant revision would truncate;
 * switch to streaming if that shows up in practice rather than pre-building it.
 */
export function nodeExec(binary: string, cwd: string): JjExec {
  return (args) =>
    new Promise<ExecResult>((resolve, reject) => {
      execFile(
        binary,
        args as string[],
        { cwd, maxBuffer: 8 * 1024 * 1024, encoding: "utf8" },
        (error, stdout, stderr) => {
          if (error && typeof error.code !== "number") {
            // Spawn itself failed (binary missing, cwd gone) — not a jj exit code.
            reject(error);
            return;
          }
          resolve({ stdout, stderr, code: error ? (error.code as number) : 0 });
        },
      );
    });
}

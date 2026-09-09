import type { CommandRecord } from "@ukemi/domain";

/** Result of one `jj` invocation. */
export interface ExecResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
}

/**
 * Runs the bundled `jj` binary. The adapter's only impurity.
 *
 * Two implementations exist and must stay behaviourally identical: `nodeExec`
 * (tests, scripts) and the Tauri shell command in the desktop app. Keeping the
 * seam at "argv in, captured output out" is what lets the contract test run the
 * real jj without a window.
 */
export type JjExec = (args: readonly string[]) => Promise<ExecResult>;

/** Receives every invocation an adapter makes. See `CommandRecord`. */
export type CommandObserver = (record: CommandRecord) => void;

/** Wrap an exec so each call is reported — success and failure alike. */
export function observed(program: string, exec: JjExec, observe: CommandObserver): JjExec {
  return async (args) => {
    const startedAt = new Date();
    const result = await exec(args);
    observe({
      program,
      args,
      code: result.code,
      stderr: result.stderr,
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
    });
    return result;
  };
}

/** Thrown when jj exits non-zero; `stderr` is jj's own message, shown verbatim. */
export class JjError extends Error {
  readonly args: readonly string[];
  readonly code: number;
  readonly stderr: string;

  constructor(args: readonly string[], code: number, stderr: string) {
    // jj's stderr is written for humans and is better than anything we'd compose.
    super(stderr.trim() || `jj exited with code ${code}`);
    this.name = "JjError";
    this.args = args;
    this.code = code;
    this.stderr = stderr;
  }
}

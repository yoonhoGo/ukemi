import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { JjCliAdapter, type ExecResult } from "@ukemi/jj-cli-adapter";
import type { JjPort } from "@ukemi/domain";

/**
 * Wires the adapter to Tauri. The only place in the UI that knows an adapter
 * exists — everything above this file depends on `JjPort` from the domain.
 *
 * A webview cannot spawn a process, so the exec seam crosses into Rust here.
 * The Rust side is deliberately dumb (argv in, captured output out); every
 * decision about jj's verbs stays in the adapter, where it is testable without
 * a window.
 */
export function portFor(root: string): JjPort {
  return new JjCliAdapter(root, (args) =>
    invoke<ExecResult>("jj_exec", { root, args: [...args] }),
  );
}

/** Ask Rust whether a folder is inside a jj workspace. */
export function isJjRepo(root: string): Promise<boolean> {
  return invoke<boolean>("is_jj_repo", { root });
}

/** The repository named on the command line, if the app was launched with one. */
export function initialRepo(): Promise<string | undefined> {
  return invoke<string | null>("initial_repo").then((root) => root ?? undefined);
}

/** Native folder picker. Returns the chosen path, or `undefined` if cancelled. */
export async function pickRepoFolder(): Promise<string | undefined> {
  const chosen = await open({ directory: true, multiple: false, title: "Open repository" });
  return typeof chosen === "string" ? chosen : undefined;
}

const LAST_REPO_KEY = "ukemi:last-repo";

/** The repo to reopen on launch. Convenience only — absence is not an error. */
export function rememberedRepo(): string | undefined {
  try {
    return localStorage.getItem(LAST_REPO_KEY) ?? undefined;
  } catch {
    // Private window or blocked storage: launch to the empty state instead.
    return undefined;
  }
}

export function rememberRepo(root: string): void {
  try {
    localStorage.setItem(LAST_REPO_KEY, root);
  } catch {
    // Not being able to remember is not worth interrupting the user over.
  }
}

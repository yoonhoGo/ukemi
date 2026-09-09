import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { t } from "./i18n/i18n.ts";
import {
  GhCliAdapter,
  JjCliAdapter,
  JjError,
  observed,
  PLAN_TOOL_SCRIPT,
  type ExecResult,
  type PlanPreparer,
} from "@ukemi/jj-cli-adapter";
import type { CommandRecord, ForgePort, JjPort, PlanFile } from "@ukemi/domain";

/**
 * The command log behind the transparency panel (design §4.8).
 *
 * A bounded list of every `jj` and `gh` invocation this window made, fed by the
 * adapters' observer. It is not app state — nothing is derived from it — which
 * is why it is a module-level buffer read through `useSyncExternalStore` and
 * not a store. ponytail: 300 entries, then the oldest fall off.
 */
const COMMAND_LOG_LIMIT = 300;
let commandLog: readonly CommandRecord[] = [];
const commandListeners = new Set<() => void>();

function recordCommand(record: CommandRecord): void {
  commandLog = [...commandLog.slice(-(COMMAND_LOG_LIMIT - 1)), record];
  for (const listener of commandListeners) listener();
}

export function subscribeCommands(listener: () => void): () => void {
  commandListeners.add(listener);
  return () => commandListeners.delete(listener);
}

export function commandLogSnapshot(): readonly CommandRecord[] {
  return commandLog;
}

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
  return new JjCliAdapter(
    root,
    (args) => invoke<ExecResult>("jj_exec", { root, args: [...args] }),
    tauriPlanPreparer,
    recordCommand,
  );
}

/** The forge for a GitHub `owner/repo`, sharing the same Rust exec seam. */
export function forgeFor(root: string, slug: string): ForgePort {
  return new GhCliAdapter(
    slug,
    (args) => invoke<ExecResult>("gh_exec", { root, args: [...args] }),
    recordCommand,
  );
}

/**
 * `PlanPreparer` backed by Tauri, since a webview cannot write files.
 *
 * The Rust side creates its own temp directory and returns the path — the
 * webview never names a location on disk, so this is not a general file-write
 * capability. The script it writes is `PLAN_TOOL_SCRIPT`, the same constant the
 * Node implementation uses, so jj's diff-editor protocol is described in one
 * place.
 */
const tauriPlanPreparer: PlanPreparer = async (files) => {
  const prepared = await invoke<{ planDir: string; scriptPath: string }>(
    "prepare_hunk_plan",
    { script: PLAN_TOOL_SCRIPT, files: files as PlanFile[] },
  );
  return {
    ...prepared,
    dispose: () => invoke<void>("discard_hunk_plan", { planDir: prepared.planDir }),
  };
};

/** Ask Rust whether a folder is inside a jj workspace. */
export function isJjRepo(root: string): Promise<boolean> {
  return invoke<boolean>("is_jj_repo", { root });
}

/** What a folder looks like to Git. `undefined` when it is not a Git repo. */
export interface GitProbe {
  /** The checked-out branch, or absent on a detached HEAD. */
  readonly branch?: string | undefined;
}

/**
 * Ask Rust whether a folder Git knows about — even though jj does not.
 *
 * Only asked after `isJjRepo` says no: the answer decides whether the empty
 * state is a dead end or an offer to colocate.
 */
export function gitProbe(root: string): Promise<GitProbe | undefined> {
  return invoke<GitProbe | null>("git_probe", { root }).then((probe) => probe ?? undefined);
}

/**
 * Put jj alongside an existing Git repository (`jj git init --colocate`).
 *
 * Goes through the same dumb exec seam every other jj call uses, and through
 * `observed` so it lands in the command log like the rest — the first command
 * the app ever runs on a repo is exactly the one a wary Git user wants to see
 * written down (design §4.8).
 *
 * Not a `JjPort` method: the port's `root` promises a jj workspace, and this
 * runs where there is not one yet.
 */
export async function initColocate(root: string): Promise<void> {
  const exec = observed(
    "jj",
    (args) => invoke<ExecResult>("jj_exec", { root, args: [...args] }),
    recordCommand,
  );
  const args = ["git", "init", "--colocate"];
  const result = await exec(args);
  if (result.code !== 0) throw new JjError(args, result.code, result.stderr);
}

/** The repository named on the command line, if the app was launched with one. */
export function initialRepo(): Promise<string | undefined> {
  return invoke<string | null>("initial_repo").then((root) => root ?? undefined);
}

/** Native folder picker. Returns the chosen path, or `undefined` if cancelled. */
async function pickFolder(title: string): Promise<string | undefined> {
  const chosen = await open({ directory: true, multiple: false, title });
  return typeof chosen === "string" ? chosen : undefined;
}

export function pickRepoFolder(): Promise<string | undefined> {
  return pickFolder(t("Open repository"));
}

/**
 * Where a new workspace goes.
 *
 * A folder picker rather than a text field, because the path is the one thing
 * `jj workspace add` cannot guess and the one thing a typo makes expensive.
 * The panel's New Folder button covers "somewhere that does not exist yet".
 */
export function pickWorkspaceFolder(): Promise<string | undefined> {
  return pickFolder(t("Empty folder for the new workspace"));
}

const RECENT_REPOS_KEY = "ukemi:recent-repos";

/**
 * The repositories opened before, newest first.
 *
 * A list rather than the single last path, because one window on one repo made
 * every project switch a trip through the folder picker. Rows are not verified
 * here: a folder that has moved or lost its `.jj` is checked on open like any
 * other candidate, and lands on the same empty state.
 *
 * ponytail: five entries in one localStorage key. A repo the user actually
 * wants pinned would need real per-repo state, and there is none yet.
 */
const RECENT_LIMIT = 5;

export function recentRepos(): readonly string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(RECENT_REPOS_KEY) ?? "[]");
    if (!Array.isArray(stored)) return [];
    return stored.filter((entry): entry is string => typeof entry === "string");
  } catch {
    // Blocked storage, or a value from before this key held a list: launch to
    // the empty state instead.
    return [];
  }
}

/** The repo to reopen on launch. Convenience only — absence is not an error. */
export function rememberedRepo(): string | undefined {
  return recentRepos()[0];
}

export function rememberRepo(root: string): void {
  try {
    const next = [root, ...recentRepos().filter((entry) => entry !== root)];
    localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(next.slice(0, RECENT_LIMIT)));
  } catch {
    // Not being able to remember is not worth interrupting the user over.
  }
}

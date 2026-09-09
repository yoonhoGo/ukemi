import type {
  Bookmark,
  ChangeId,
  CommandRecord,
  ConflictedFile,
  DiffOptions,
  FileChange,
  FileStatus,
  GitInfo,
  JjPort,
  Operation,
  OperationId,
  PlanFile,
  ReadOptions,
  RebaseMode,
  Revision,
  RevsetAlias,
  RevsetFunction,
  Workspace,
  WriteResult,
} from "@ukemi/domain";
import { isAliasName } from "@ukemi/domain";
import { parseRevsetFunctions } from "./revset-help.ts";
import { JjError, observed, type CommandObserver, type JjExec } from "./exec.ts";
import { planToolArgs, type PlanPreparer } from "./hunk-plan.ts";
import {
  BOOKMARK_TEMPLATE,
  CONFIG_TEMPLATE,
  OPERATION_TEMPLATE,
  REVISION_TEMPLATE,
  WORKSPACE_TEMPLATE,
} from "./templates.ts";

/** The config table jj keeps named revsets in. */
const ALIAS_TABLE = "revset-aliases";

/** Raw shapes as the templates emit them, before normalisation. */
interface RawRevision extends Omit<Revision, "description" | "parents"> {
  description: string;
  parents: ChangeId[];
}
interface RawBookmark {
  name: string;
  remote: string | null;
  present: boolean;
  conflict: boolean;
  tracked: boolean;
  ahead: number | null;
  behind: number | null;
  target: ChangeId | null;
}
interface RawConfig {
  name: string;
  value: unknown;
}
interface RawOperation {
  id: string;
  description: string;
  time: string;
  user: string;
  attributes: string;
  isCurrent: boolean;
}

function parseNdjson<T>(stdout: string): T[] {
  const out: T[] = [];
  for (const line of stdout.split("\n")) {
    if (line.length === 0) continue;
    out.push(JSON.parse(line) as T);
  }
  return out;
}

/** `A path`, `M path`, `R old => new` — the `--summary` shorthand. */
const STATUS_CODES: Record<string, FileStatus> = {
  A: "added",
  M: "modified",
  D: "removed",
  R: "renamed",
  C: "copied",
};

/**
 * `JjPort` over the `jj` CLI.
 *
 * Reads always carry `--ignore-working-copy` (no snapshot as a side effect of
 * looking) and, when the caller pins one, `--at-operation` (the window sees one
 * consistent point in time even while another process writes). Writes omit
 * both, so they snapshot normally, and each returns the operation it created so
 * the caller can move its pin forward instead of re-polling.
 */
export class JjCliAdapter implements JjPort {
  readonly root: string;
  private readonly exec: JjExec;
  private readonly preparePlan: PlanPreparer | undefined;

  /**
   * `preparePlan` enables the hunk-level operations. It is optional because a
   * caller that only reads (a script, a test of the log) has no reason to be
   * able to write files, and leaving it out makes that impossible rather than
   * merely unused.
   */
  constructor(
    root: string,
    exec: JjExec,
    preparePlan?: PlanPreparer,
    observe?: CommandObserver,
  ) {
    this.root = root;
    // Every invocation is reported, so the transparency panel is a fact about
    // what ran rather than a reconstruction from the op log.
    this.exec = observe ? observed("jj", exec, observe) : exec;
    this.preparePlan = preparePlan;
  }

  /** Flags on every invocation: no colour codes, no pager. */
  private base(): string[] {
    return ["--color=never", "--no-pager", "-R", this.root];
  }

  /**
   * Base flags plus the read-only guarantees. Reads are also `--quiet`: their
   * output is parsed, so jj's hints are noise. Writes are not, because what jj
   * says after a write ("Absorbed changes into…", "Working copy now at…") is
   * the message the user gets to see.
   */
  private readBase(opts?: ReadOptions): string[] {
    const args = [...this.base(), "--quiet", "--ignore-working-copy"];
    if (opts?.atOp) args.push(`--at-operation=${opts.atOp}`);
    return args;
  }

  private async run(args: string[]): Promise<string> {
    return (await this.runFull(args)).stdout;
  }

  private async runFull(args: string[]): Promise<{ stdout: string; stderr: string }> {
    const result = await this.exec(args);
    if (result.code !== 0) throw new JjError(args, result.code, result.stderr);
    return result;
  }

  private async write(args: string[]): Promise<WriteResult> {
    const { stderr } = await this.runFull([...this.base(), ...args]);
    // The op the write produced. Read it back rather than parsing jj's prose;
    // the prose itself is kept only as a message for the user.
    const message = stderr.trim();
    return { opId: await this.currentOperation(), ...(message ? { message } : {}) };
  }

  async currentOperation(): Promise<OperationId> {
    const out = await this.run([
      ...this.base(),
      "--quiet",
      "--ignore-working-copy",
      "op",
      "log",
      "--no-graph",
      "--limit",
      "1",
      "-T",
      "id",
    ]);
    return out.trim();
  }

  async log(revset: string, opts?: ReadOptions): Promise<Revision[]> {
    const out = await this.run([
      ...this.readBase(opts),
      "log",
      "--no-graph",
      "-r",
      revset,
      "-T",
      REVISION_TEMPLATE,
    ]);
    return parseNdjson<RawRevision>(out).map(normaliseRevision);
  }

  async show(rev: string, opts?: ReadOptions): Promise<Revision | undefined> {
    const revisions = await this.log(rev, opts);
    return revisions[0];
  }

  async diffSummary(rev: string, opts?: ReadOptions): Promise<FileChange[]> {
    const out = await this.run([
      ...this.readBase(opts),
      "diff",
      "-r",
      rev,
      "--summary",
    ]);
    return out
      .split("\n")
      .filter((line) => line.length > 2)
      .map((line) => {
        const status = STATUS_CODES[line[0]!] ?? "modified";
        const rest = line.slice(2);
        // A rename prints `old => new`; the new path is what the UI opens.
        const path = rest.includes(" => ") ? rest.split(" => ")[1]! : rest;
        return { path, status };
      });
  }

  async diff(rev: string, path?: string, opts?: DiffOptions): Promise<string> {
    const args = [...this.readBase(opts), "diff", "-r", rev, "--git"];
    // Left off entirely when unset, so jj's own default of three stays the
    // default and the arg list of the common read does not change.
    if (opts?.context !== undefined) args.push("--context", String(opts.context));
    // `--` keeps a path that looks like a flag from being read as one.
    if (path !== undefined) args.push("--", path);
    return this.run(args);
  }

  async bookmarks(opts?: ReadOptions): Promise<Bookmark[]> {
    const out = await this.run([
      ...this.readBase(opts),
      "bookmark",
      "list",
      "--all-remotes",
      "-T",
      BOOKMARK_TEMPLATE,
    ]);
    return parseNdjson<RawBookmark>(out).map((raw) => {
      const bookmark: {
        -readonly [K in keyof Bookmark]: Bookmark[K];
      } = { name: raw.name, hasConflict: raw.conflict };
      if (raw.target !== null) bookmark.target = raw.target;
      if (raw.remote !== null) bookmark.remote = raw.remote;
      if (raw.ahead !== null) bookmark.ahead = raw.ahead;
      if (raw.behind !== null) bookmark.behind = raw.behind;
      return bookmark;
    });
  }

  async workspaces(opts?: ReadOptions): Promise<Workspace[]> {
    const out = await this.run([
      ...this.readBase(opts),
      "workspace",
      "list",
      "-T",
      WORKSPACE_TEMPLATE,
    ]);
    return parseNdjson<Workspace>(out);
  }

  async operations(limit: number, opts?: ReadOptions): Promise<Operation[]> {
    const out = await this.run([
      ...this.readBase(opts),
      "op",
      "log",
      "--no-graph",
      "--limit",
      String(limit),
      "-T",
      OPERATION_TEMPLATE,
    ]);
    return parseNdjson<RawOperation>(out).map((raw) => {
      const operation: { -readonly [K in keyof Operation]: Operation[K] } = {
        id: raw.id,
        description: raw.description,
        time: raw.time,
        user: raw.user,
        isCurrent: raw.isCurrent,
      };
      // attributes() is `args: jj log …`, or empty for an op jj recorded itself.
      const args = raw.attributes.replace(/^args:\s*/, "").trim();
      if (args.length > 0) operation.args = args;
      return operation;
    });
  }

  async gitInfo(): Promise<GitInfo> {
    const gitRoot = (await this.run([...this.readBase(), "git", "root"])).trim();
    const remotesOut = await this.run([
      ...this.readBase(),
      "git",
      "remote",
      "list",
    ]);
    const remotes = remotesOut
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        // `<name> <url>`; a URL has no spaces, a remote name may not either.
        const space = line.indexOf(" ");
        return { name: line.slice(0, space), url: line.slice(space + 1).trim() };
      });
    // Colocated means the Git dir is a `.git` outside `.jj/`; a non-colocated
    // repo keeps it at `.jj/repo/store/git`. Judged by shape rather than by
    // comparing with `root`, which may differ by a symlink (macOS `/var`).
    // ponytail: an external `--git-repo` dir reads as colocated; fine until
    // someone has one.
    const colocated = /[\/\\]\.git$/.test(gitRoot) && !/[\/\\]\.jj[\/\\]/.test(gitRoot);
    return { gitRoot, colocated, remotes };
  }

  async revsetAliases(): Promise<RevsetAlias[]> {
    // `config list` exits non-zero when nothing matches, which for a repo that
    // has never saved an alias is the normal case, not an error.
    const result = await this.exec([
      ...this.base(),
      "config",
      "list",
      "--repo",
      ALIAS_TABLE,
      "-T",
      CONFIG_TEMPLATE,
    ]);
    if (result.code !== 0) return [];
    const aliases: RevsetAlias[] = [];
    for (const raw of parseNdjson<RawConfig>(result.stdout)) {
      const name = raw.name.slice(ALIAS_TABLE.length + 1);
      // Anything the app would not have written: a quoted name (`"a | all()"`),
      // a function alias (`mine(x)`), a value that is not a string. Skipped
      // rather than shown, because a row the sidebar cannot safely click is
      // worse than a row that is missing — the config file is still the truth
      // and `jj config list` still shows it.
      if (!isAliasName(name) || typeof raw.value !== "string") continue;
      aliases.push({ name, revset: raw.value });
    }
    return aliases;
  }

  async saveRevsetAlias(name: string, revset: string): Promise<void> {
    // The name reaches jj as part of a config key and comes back as a bare
    // revset symbol, so it is checked here as well as in the UI: this is the
    // last point before it enters an argv.
    if (!isAliasName(name)) throw new Error(`invalid revset alias name: ${name}`);
    await this.run([...this.base(), "config", "set", "--repo", `${ALIAS_TABLE}.${name}`, revset]);
  }

  async deleteRevsetAlias(name: string): Promise<void> {
    if (!isAliasName(name)) throw new Error(`invalid revset alias name: ${name}`);
    await this.run([...this.base(), "config", "unset", "--repo", `${ALIAS_TABLE}.${name}`]);
  }

  async revsetFunctions(): Promise<RevsetFunction[]> {
    // No repo flags at all: this asks the binary what it knows, and a broken
    // or missing repo must not be able to empty the palette.
    const out = await this.run(["--color=never", "--no-pager", "help", "-k", "revsets"]);
    return parseRevsetFunctions(out);
  }

  // ---- writes -------------------------------------------------------------

  describe(rev: string, message: string): Promise<WriteResult> {
    // `-m` with an empty string clears the description, which is a valid ask.
    return this.write(["describe", "-r", rev, "-m", message]);
  }

  newChange(parents: readonly string[], message?: string): Promise<WriteResult> {
    const args = ["new", ...parents];
    if (message !== undefined) args.push("-m", message);
    return this.write(args);
  }

  edit(rev: string): Promise<WriteResult> {
    return this.write(["edit", "-r", rev]);
  }

  abandon(revs: readonly string[]): Promise<WriteResult> {
    return this.write(["abandon", "-r", ...revs]);
  }

  bookmarkSet(name: string, rev: string): Promise<WriteResult> {
    // `set --allow-backwards` covers both create and move, so the UI needs one verb.
    return this.write(["bookmark", "set", name, "-r", rev, "--allow-backwards"]);
  }

  bookmarkDelete(name: string): Promise<WriteResult> {
    return this.write(["bookmark", "delete", name]);
  }

  addWorkspace(path: string, name?: string): Promise<WriteResult> {
    const args = ["workspace", "add"];
    if (name !== undefined) args.push("--name", name);
    args.push(path);
    return this.write(args);
  }

  forgetWorkspace(name: string): Promise<WriteResult> {
    return this.write(["workspace", "forget", name]);
  }

  bookmarkTrack(name: string, remote: string): Promise<WriteResult> {
    return this.write(["bookmark", "track", `${name}@${remote}`]);
  }

  fetch(remote?: string): Promise<WriteResult> {
    const args = ["git", "fetch"];
    if (remote !== undefined) args.push("--remote", remote);
    return this.write(args);
  }

  push(args?: {
    readonly remote?: string;
    readonly bookmarks?: readonly string[];
    readonly changes?: readonly ChangeId[];
  }): Promise<WriteResult> {
    const argv = ["git", "push"];
    if (args?.remote !== undefined) argv.push("--remote", args.remote);
    for (const bookmark of args?.bookmarks ?? []) argv.push("--bookmark", bookmark);
    for (const change of args?.changes ?? []) argv.push("--change", change);
    return this.write(argv);
  }

  rebase(mode: RebaseMode, rev: string, onto: string): Promise<WriteResult> {
    const flag = mode === "revision" ? "-r" : mode === "source" ? "-s" : "-b";
    // `--onto` is the current spelling; `-d` remains as an alias in jj 0.43 but
    // is not what the transparency panel should teach.
    return this.write(["rebase", flag, rev, "--onto", onto]);
  }

  squash(args: {
    readonly from: string;
    readonly into: string;
    readonly paths?: readonly string[] | undefined;
    readonly message?: string | undefined;
  }): Promise<WriteResult> {
    const argv = ["squash", "--from", args.from, "--into", args.into];
    // Without a message jj opens an editor; keeping the destination's own
    // description is the right default for moving work into an existing change.
    if (args.message === undefined) argv.push("--use-destination-message");
    else argv.push("-m", args.message);
    if (args.paths && args.paths.length > 0) argv.push("--", ...args.paths);
    return this.write(argv);
  }

  split(args: {
    readonly rev: string;
    readonly paths: readonly string[];
    readonly message?: string | undefined;
  }): Promise<WriteResult> {
    const argv = ["split", "-r", args.rev];
    // `-m` is what keeps `jj split` from opening $EDITOR; the upper revision
    // keeps the original description either way.
    argv.push("-m", args.message ?? "");
    if (args.paths.length > 0) argv.push("--", ...args.paths);
    return this.write(argv);
  }

  splitHunks(args: {
    readonly rev: string;
    readonly keep: readonly PlanFile[];
    readonly message?: string | undefined;
  }): Promise<WriteResult> {
    return this.withPlan(args.keep, (toolArgs) =>
      this.write(["split", "-r", args.rev, "-m", args.message ?? "", ...toolArgs]),
    );
  }

  squashHunks(args: {
    readonly from: string;
    readonly into: string;
    readonly keep: readonly PlanFile[];
  }): Promise<WriteResult> {
    return this.withPlan(args.keep, (toolArgs) =>
      this.write([
        "squash",
        "--from",
        args.from,
        "--into",
        args.into,
        "--use-destination-message",
        ...toolArgs,
      ]),
    );
  }

  async fileContent(rev: string, path: string, opts?: ReadOptions): Promise<string> {
    // `--` so a path that looks like a flag is still a path.
    return this.run([...this.readBase(opts), "file", "show", "-r", rev, "--", path]);
  }

  async conflicts(rev: string, opts?: ReadOptions): Promise<ConflictedFile[]> {
    // `jj resolve --list` exits non-zero when there is nothing to resolve, but
    // "this revision has no conflicts" is an answer to the question, not a
    // failure. Checked via the revision's own conflict flag rather than by
    // matching jj's error text, which is not a stable interface.
    const revision = await this.show(rev, opts);
    if (!revision?.hasConflict) return [];

    const out = await this.run([...this.readBase(opts), "resolve", "--list", "-r", rev]);
    return out
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        // `<path><spaces><description>`; a path may contain single spaces, so
        // the split is on the run of two or more.
        const match = /^(.*?)\s{2,}(.*)$/.exec(line);
        const path = match ? match[1]! : line.trim();
        const description = match ? match[2]!.trim() : "";
        const sides = /^(\d+)-sided/.exec(description);
        return {
          path,
          description,
          ...(sides ? { sides: Number(sides[1]) } : {}),
        };
      });
  }

  resolveTakingSide(
    rev: string,
    path: string,
    side: "ours" | "theirs",
  ): Promise<WriteResult> {
    // `:ours` / `:theirs` are jj's built-in merge tools, so this needs no editor.
    return this.write(["resolve", "-r", rev, "--tool", `:${side}`, "--", path]);
  }

  /**
   * Run one command with a materialised hunk plan registered as jj's diff
   * editor, and always clean the plan up afterwards — a cancelled or failed
   * split must not leave the user's file contents sitting in a temp directory.
   */
  private async withPlan(
    keep: readonly PlanFile[],
    run: (toolArgs: string[]) => Promise<WriteResult>,
  ): Promise<WriteResult> {
    if (!this.preparePlan) {
      throw new Error("hunk-level operations need a PlanPreparer");
    }
    const plan = await this.preparePlan(keep);
    try {
      return await run(planToolArgs(plan));
    } finally {
      await plan.dispose();
    }
  }

  absorb(from: string, into?: string): Promise<WriteResult> {
    const args = ["absorb", "--from", from];
    if (into !== undefined) args.push("--into", into);
    return this.write(args);
  }

  undo(): Promise<WriteResult> {
    return this.write(["undo"]);
  }

  restoreOperation(opId: OperationId): Promise<WriteResult> {
    return this.write(["op", "restore", opId]);
  }
}

function normaliseRevision(raw: RawRevision): Revision {
  return {
    ...raw,
    // jj keeps the trailing newline on a description; nothing downstream wants it.
    description: raw.description.replace(/\n+$/, ""),
    parents: raw.parents,
  };
}

import type {
  Bookmark,
  ChangeId,
  FileChange,
  FileStatus,
  JjPort,
  Operation,
  OperationId,
  ReadOptions,
  Revision,
  Workspace,
  WriteResult,
} from "@ukemi/domain";
import { JjError, type JjExec } from "./exec.ts";
import {
  BOOKMARK_TEMPLATE,
  OPERATION_TEMPLATE,
  REVISION_TEMPLATE,
  WORKSPACE_TEMPLATE,
} from "./templates.ts";

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

  constructor(root: string, exec: JjExec) {
    this.root = root;
    this.exec = exec;
  }

  /** Flags on every invocation: no colour codes, no pager, no chatter. */
  private base(): string[] {
    return ["--color=never", "--no-pager", "--quiet", "-R", this.root];
  }

  /** Base flags plus the read-only guarantees. */
  private readBase(opts?: ReadOptions): string[] {
    const args = [...this.base(), "--ignore-working-copy"];
    if (opts?.atOp) args.push(`--at-operation=${opts.atOp}`);
    return args;
  }

  private async run(args: string[]): Promise<string> {
    const result = await this.exec(args);
    if (result.code !== 0) throw new JjError(args, result.code, result.stderr);
    return result.stdout;
  }

  private async write(args: string[]): Promise<WriteResult> {
    await this.run([...this.base(), ...args]);
    // The op the write produced. Read it back rather than parsing jj's prose.
    return { opId: await this.currentOperation() };
  }

  async currentOperation(): Promise<OperationId> {
    const out = await this.run([
      ...this.base(),
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

  async diff(rev: string, path?: string, opts?: ReadOptions): Promise<string> {
    const args = [...this.readBase(opts), "diff", "-r", rev, "--git"];
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

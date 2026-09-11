import type { CheckState, ForgePort, PullRequest, PullRequestState } from "@ukemi/domain";
import { JjError, observed, type CommandObserver, type JjExec } from "./exec.ts";

/**
 * `ForgePort` over the `gh` CLI.
 *
 * `gh` is not bundled: it carries the user's GitHub login, which the app must
 * not own. Every call passes `-R owner/repo` explicitly, so a jj repo whose
 * Git dir lives under `.jj/` (not colocated) works the same as one with `.git`
 * beside it — gh never has to find the repository itself.
 */
export class GhCliAdapter implements ForgePort {
  readonly slug: string;
  private readonly exec: JjExec;

  constructor(slug: string, exec: JjExec, observe?: CommandObserver) {
    this.slug = slug;
    this.exec = observe ? observed("gh", exec, observe) : exec;
  }

  private async run(args: string[]): Promise<string> {
    const result = await this.exec(args);
    if (result.code !== 0) throw new JjError(args, result.code, result.stderr);
    return result.stdout;
  }

  /**
   * ponytail: `statusCheckRollup` is asked for on all 200 PRs, closed ones
   * included, because `gh pr list --json` has no way to ask per row. On a repo
   * with a wide CI matrix that is a few MB of JSON, parsed once a minute at
   * worst. Narrow the `--state`/`--limit` if it ever shows up.
   */
  async pullRequests(): Promise<PullRequest[]> {
    const out = await this.run([
      "pr",
      "list",
      "-R",
      this.slug,
      "--state",
      "all",
      "--limit",
      "200",
      "--json",
      "number,title,state,url,headRefName,baseRefName,isDraft,reviewDecision,statusCheckRollup",
    ]);
    const raw = JSON.parse(out) as {
      number: number;
      title: string;
      state: "OPEN" | "MERGED" | "CLOSED";
      url: string;
      headRefName: string;
      baseRefName: string;
      isDraft: boolean;
      reviewDecision: string;
      statusCheckRollup: RawCheck[] | null;
    }[];
    return raw.map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state.toLowerCase() as PullRequestState,
      url: pr.url,
      headBranch: pr.headRefName,
      baseBranch: pr.baseRefName,
      isDraft: pr.isDraft,
      reviewDecision: pr.reviewDecision ?? "",
      checks: rollUpChecks(pr.statusCheckRollup),
    }));
  }

  async createPullRequest(args: {
    readonly head: string;
    readonly base: string;
    readonly title: string;
    readonly body: string;
  }): Promise<string> {
    const out = await this.run([
      "pr",
      "create",
      "-R",
      this.slug,
      "--head",
      args.head,
      "--base",
      args.base,
      "--title",
      args.title,
      "--body",
      args.body,
    ]);
    return out.trim();
  }

  async openInBrowser(number: number): Promise<void> {
    // gh already knows how to open a browser; no URL-opening plugin needed.
    await this.run(["pr", "view", String(number), "-R", this.slug, "--web"]);
  }
}

/**
 * One entry of `statusCheckRollup`, in either of the two shapes GitHub returns.
 *
 * A `CheckRun` is an Actions job and carries `status` plus `conclusion`; a
 * `StatusContext` is the older commit-status API and carries one `state`. Both
 * arrive in the same array, which is why neither field can be assumed present.
 */
interface RawCheck {
  __typename?: string;
  status?: string;
  conclusion?: string | null;
  state?: string;
}

/** Conclusions that mean the check said no, as opposed to said nothing. */
const FAILED = new Set([
  "FAILURE",
  "TIMED_OUT",
  "CANCELLED",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
  "ERROR",
]);

/**
 * Every check on a PR, as one word.
 *
 * `SKIPPED` and `NEUTRAL` are deliberately not failures: a job that opted out
 * of running is not a job that said no, and counting it red would paint most
 * monorepo PRs red forever. Anything not yet `COMPLETED` is pending, and a
 * single failure outranks any number of pending ones.
 *
 * Exported for its own test: this is the only place in the adapter that turns
 * a list into a verdict, so it is the only place a wrong rule would hide.
 */
export function rollUpChecks(checks: readonly RawCheck[] | null | undefined): CheckState {
  if (!checks || checks.length === 0) return "none";
  let pending = false;
  for (const check of checks) {
    const verdict = check.conclusion ?? check.state ?? "";
    if (FAILED.has(verdict)) return "failing";
    // A CheckRun says so through `status`; a StatusContext through `state`.
    if (check.status !== undefined ? check.status !== "COMPLETED" : verdict === "PENDING") {
      pending = true;
    }
  }
  return pending ? "pending" : "passing";
}

/**
 * `owner/repo` from a GitHub remote URL, or `undefined` for any other host.
 * Covers `https://github.com/o/r(.git)`, `git@github.com:o/r(.git)` and
 * `ssh://git@github.com/o/r`.
 */
export function githubSlug(url: string): string | undefined {
  const match = /github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url.trim());
  return match ? `${match[1]}/${match[2]}` : undefined;
}

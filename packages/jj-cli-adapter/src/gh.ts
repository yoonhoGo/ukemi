import type { ForgePort, PullRequest, PullRequestState } from "@ukemi/domain";
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
      "number,title,state,url,headRefName,baseRefName,isDraft,reviewDecision",
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
 * `owner/repo` from a GitHub remote URL, or `undefined` for any other host.
 * Covers `https://github.com/o/r(.git)`, `git@github.com:o/r(.git)` and
 * `ssh://git@github.com/o/r`.
 */
export function githubSlug(url: string): string | undefined {
  const match = /github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url.trim());
  return match ? `${match[1]}/${match[2]}` : undefined;
}

import type { PullRequest, Revision } from "@ukemi/domain";
import { prBaseFor, prHeadFor, pullRequestFor, stackOf, unpushableReason } from "@ukemi/domain";
import {
  useForge,
  useForgeMutation,
  useJjMutation,
  useLog,
  usePullRequests,
  useRepo,
  useTrunkBookmark,
} from "../repo.tsx";
import { nodeColor } from "./change-color.ts";

/**
 * The stack panel — design §4.5.
 *
 * A chain of bookmark-less changes is a stack whether or not jj has a word for
 * it. Pushing it is one `jj git push --change …` per revision (jj mints the
 * bookmark), and after a rebase the same command re-pushes every one, so
 * "Push stack" is both the first push and the update. PRs come from `gh`, one
 * per revision, each based on the one below so the chain reviews as a chain.
 *
 * Without a GitHub remote or `gh`, only the push half shows. That is a normal
 * state, not an error.
 */
export function StackPanel({ revision }: { revision: Revision }) {
  const { isPinned } = useRepo();
  const log = useLog();
  const forge = useForge();
  const prs = usePullRequests();
  const trunk = useTrunkBookmark();

  const stack = log.data ? stackOf(log.data, revision.changeId) : [];
  const pushable = stack.filter((r) => unpushableReason(r) === undefined);
  const push = useJjMutation((port) =>
    port.push({ changes: pushable.map((r) => r.changeId) }),
  );
  const openPr = useForgeMutation(
    (f, args: { head: string; base: string; title: string; body: string }) =>
      f.createPullRequest(args),
  );
  const view = useForgeMutation((f, number: number) => f.openInBrowser(number));

  // An empty working copy alone is not a stack worth a panel.
  if (stack.length < 2 && pushable.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "10px 16px 12px",
        borderTop: "1px solid var(--u-line-faint)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="side-head" style={{ padding: 0 }}>
          STACK · {stack.length} CHANGE{stack.length === 1 ? "" : "S"}
        </span>
        <span style={{ flexGrow: 1 }} />
        <button
          type="button"
          className="tb-btn"
          style={{ height: 22, fontSize: 11.5 }}
          disabled={isPinned || pushable.length === 0 || push.isPending}
          title={
            isPinned
              ? "Return to now to push"
              : pushable.length === 0
                ? "Nothing here can be pushed yet"
                : `jj git push ${pushable.map((r) => `--change ${r.changeId.slice(0, 8)}`).join(" ")}`
          }
          onClick={() => push.mutate(undefined)}
        >
          {push.isPending ? "Pushing…" : `Push stack (${pushable.length})`}
        </button>
      </div>
      <div className="sec" style={{ fontSize: 11.5, paddingBottom: 4 }}>
        {forge
          ? `One PR per change on ${forge.slug}, each based on the one below.`
          : "No GitHub remote or gh login: pushing works, PRs do not."}
      </div>

      {/* Top of the stack first, to match the graph. */}
      {[...stack].reverse().map((r, reversedIndex) => {
        const index = stack.length - 1 - reversedIndex;
        const pr = prs.data ? pullRequestFor(r, prs.data) : undefined;
        const reason = unpushableReason(r);
        const head = prHeadFor(r);
        const base = prBaseFor(stack, index, trunk ?? "main");
        const canOpen =
          forge !== undefined && !isPinned && !pr && !reason && head !== undefined && base !== undefined;
        return (
          <div
            key={r.changeId}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              height: 26,
              padding: "0 6px",
              borderRadius: 6,
              background: r.changeId === revision.changeId ? "var(--u-bg-selected)" : undefined,
            }}
          >
            <span className="mono" style={{ color: nodeColor(r), fontWeight: 700 }}>
              {r.changeId.slice(0, 2)}
              <span className="ter" style={{ fontWeight: 400 }}>
                {r.changeId.slice(2, 6)}
              </span>
            </span>
            <span
              style={{
                flexGrow: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: 12,
              }}
            >
              {r.description.split("\n")[0] || <span className="sec">(no description)</span>}
            </span>
            {reason && <span className="pill">{reason}</span>}
            {pr ? (
              <button
                type="button"
                className="pill"
                data-kind="pr"
                data-state={pr.state}
                title={`${pr.title}\n${pr.url}`}
                onClick={() => view.mutate(pr.number)}
              >
                <PrLabel pr={pr} />
              </button>
            ) : canOpen ? (
              <button
                type="button"
                className="tb-btn"
                style={{ height: 20, fontSize: 11 }}
                disabled={openPr.isPending}
                title={`gh pr create --head ${head} --base ${base}`}
                onClick={() => {
                  const [title, ...rest] = r.description.split("\n");
                  openPr.mutate({ head: head!, base: base!, title: title!, body: rest.join("\n").trim() });
                }}
              >
                Open PR
              </button>
            ) : (
              !reason &&
              forge &&
              head === undefined && (
                <span className="ter" style={{ fontSize: 11 }}>
                  push first
                </span>
              )
            )}
          </div>
        );
      })}

      {(push.error ?? openPr.error ?? view.error) && (
        <div
          role="alert"
          className="mono selectable"
          style={{ fontSize: 11, color: "var(--u-conflict)", whiteSpace: "pre-wrap" }}
        >
          {String(((push.error ?? openPr.error ?? view.error) as Error).message)}
        </div>
      )}
    </div>
  );
}

/** `#12 open` / `#12 draft` / `#12 merged` / `#12 ✓` when approved. */
export function PrLabel({ pr }: { pr: PullRequest }) {
  const status =
    pr.state !== "open"
      ? pr.state
      : pr.isDraft
        ? "draft"
        : pr.reviewDecision === "APPROVED"
          ? "approved"
          : pr.reviewDecision === "CHANGES_REQUESTED"
            ? "changes"
            : "open";
  return (
    <>
      #{pr.number} <span style={{ fontWeight: 400 }}>{status}</span>
    </>
  );
}

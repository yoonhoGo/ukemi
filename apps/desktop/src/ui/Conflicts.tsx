import type { ChangeId, Revision } from "@ukemi/domain";
import { useConflicts, useJjMutation } from "../repo.tsx";
import { nodeColor } from "./change-color.ts";

/**
 * The conflict panel — design §4.3, "conflicts as data".
 *
 * There is no "rebase in progress" state to escape from, because jj has none:
 * a conflict is recorded in the commit and work continues. So this is a list
 * and two buttons, not a wizard. Resolving a conflict propagates to descendants
 * on its own, which is why nothing here has to walk a stack.
 *
 * Only "take a side" is offered. Anything finer is a hunk edit, and the hunk
 * editor already exists for that — a second three-way merge UI would be a
 * second thing to keep correct for no new capability.
 */
export function Conflicts({
  revision,
  onShowRevision,
}: {
  revision: Revision;
  onShowRevision(changeId: ChangeId): void;
}) {
  const conflicts = useConflicts(revision.changeId);
  const resolve = useJjMutation(
    (port, args: { path: string; side: "ours" | "theirs" }) =>
      port.resolveTakingSide(revision.changeId, args.path, args.side),
  );

  if (!revision.hasConflict) return null;

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
      <div className="side-head" style={{ padding: "0 0 4px" }}>
        {conflicts.data
          ? `${conflicts.data.length} CONFLICTED FILE${conflicts.data.length === 1 ? "" : "S"}`
          : "CONFLICTS"}
      </div>
      <div className="sec" style={{ fontSize: 11.5, paddingBottom: 4 }}>
        Nothing is blocked. Resolve now or later — descendants pick it up
        automatically.
      </div>

      {conflicts.isPending && <div className="sec">Reading conflicts…</div>}
      {conflicts.data?.map((file) => (
        <div
          key={file.path}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: "6px 8px",
            borderRadius: 6,
            background: "var(--u-conflict-soft)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              className="mono"
              style={{
                flexGrow: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                direction: "rtl",
                textAlign: "left",
              }}
              title={file.path}
            >
              {file.path}
            </span>
            {/* jj's own wording for the shape of the conflict. */}
            <span className="pill" data-kind="conflict">
              {file.description}
            </span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className="tb-btn"
              style={{ height: 22, fontSize: 11.5 }}
              disabled={resolve.isPending}
              title="Keep the first side (jj's :ours)"
              onClick={() => resolve.mutate({ path: file.path, side: "ours" })}
            >
              Take ours
            </button>
            <button
              type="button"
              className="tb-btn"
              style={{ height: 22, fontSize: 11.5 }}
              disabled={resolve.isPending}
              title="Keep the second side (jj's :theirs)"
              onClick={() => resolve.mutate({ path: file.path, side: "theirs" })}
            >
              Take theirs
            </button>
            <span style={{ flexGrow: 1 }} />
            <button
              type="button"
              className="tb-btn"
              style={{ height: 22, fontSize: 11.5 }}
              title="Edit the conflict markers by hunk instead"
              onClick={() => onShowRevision(revision.changeId)}
            >
              Edit by hunk <span className="key">⌘⇧S</span>
            </button>
          </div>
        </div>
      ))}

      {resolve.error && (
        <div
          role="alert"
          className="mono selectable"
          style={{ fontSize: 11, color: "var(--u-conflict)", whiteSpace: "pre-wrap" }}
        >
          {resolve.error instanceof Error ? resolve.error.message : String(resolve.error)}
        </div>
      )}
    </div>
  );
}

/**
 * Marker for the graph: conflicts live on revisions, and the saved revset
 * `conflicts()` already lists them, so this is only the inspector's local view.
 */
export function conflictLabel(count: number): string {
  return `${count} conflict${count === 1 ? "" : "s"}`;
}

import type { ChangeId, Revision, Workspace } from "@ukemi/domain";
import { useBoardRevisions, useWorkspaces } from "../repo.tsx";
import { authorInitials, nodeColor } from "./change-color.ts";
import { relativeTime } from "./time.ts";

/**
 * The workspace board — design §4.6, the control tower for parallel agents.
 *
 * One column per workspace. Each shows the change its working copy sits on,
 * who last touched it and when (the committer, which jj updates on every
 * snapshot), and the mutable changes underneath it — the work that workspace
 * has stacked up but not landed. Two workspaces on the same change share a
 * colour, since colour is keyed by change ID everywhere in the app.
 *
 * ponytail: "which process made the last operation" is not here. jj's op log
 * records user@host but not the workspace, so nothing honest can be shown per
 * column; the committer time is the closest true signal.
 */
export function Board({
  onShow,
}: {
  /** Jump to a revision in the graph. */
  onShow(changeId: ChangeId): void;
}) {
  const workspaces = useWorkspaces();
  const revisions = useBoardRevisions(workspaces.data);
  const byId = new Map((revisions.data ?? []).map((r) => [r.changeId, r]));

  if (workspaces.isPending || revisions.isPending) {
    return (
      <div className="sec" style={{ padding: 16 }}>
        Reading workspaces…
      </div>
    );
  }

  return (
    <div
      className="u-scroll"
      style={{ display: "flex", gap: 12, padding: 14, flexGrow: 1, minHeight: 0, overflowX: "auto" }}
    >
      {workspaces.data?.map((workspace, index) => (
        <Column
          key={workspace.name}
          workspace={workspace}
          isThis={index === 0}
          byId={byId}
          onShow={onShow}
        />
      ))}
    </div>
  );
}

/** Mutable ancestors of `head`, nearest first, within the loaded set. */
function stackBelow(head: Revision, byId: ReadonlyMap<ChangeId, Revision>): Revision[] {
  const out: Revision[] = [];
  let cursor: Revision | undefined = head;
  while (cursor && cursor.parents.length === 1) {
    cursor = byId.get(cursor.parents[0]!);
    if (!cursor || cursor.isImmutable) break;
    out.push(cursor);
  }
  return out;
}

function Column({
  workspace,
  isThis,
  byId,
  onShow,
}: {
  workspace: Workspace;
  isThis: boolean;
  byId: ReadonlyMap<ChangeId, Revision>;
  onShow(changeId: ChangeId): void;
}) {
  const head = byId.get(workspace.changeId);
  const below = head ? stackBelow(head, byId) : [];
  const conflicts = [head, ...below].filter((r) => r?.hasConflict).length;

  return (
    <section
      style={{
        width: 260,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 10,
        borderRadius: 10,
        background: "var(--u-bg-sidebar)",
        border: "1px solid var(--u-line)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontWeight: 600 }}>{workspace.name}</span>
        {isThis && <span className="pill">this window</span>}
        <span style={{ flexGrow: 1 }} />
        {conflicts > 0 && (
          <span className="pill" data-kind="conflict">
            {conflicts} conflict{conflicts === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {head ? (
        <Card revision={head} isHead onShow={onShow} />
      ) : (
        <div className="sec" style={{ fontSize: 12 }}>
          Working copy not in view.
        </div>
      )}

      <div className="side-head" style={{ padding: "4px 0 0" }}>
        {below.length === 0 ? "NOTHING STACKED" : `${below.length} STACKED BELOW`}
      </div>
      {below.map((r) => (
        <Card key={r.changeId} revision={r} isHead={false} onShow={onShow} />
      ))}
    </section>
  );
}

function Card({
  revision,
  isHead,
  onShow,
}: {
  revision: Revision;
  isHead: boolean;
  onShow(changeId: ChangeId): void;
}) {
  const color = nodeColor(revision);
  return (
    <button
      type="button"
      onClick={() => onShow(revision.changeId)}
      title="Show in graph"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "8px 10px",
        borderRadius: 8,
        textAlign: "left",
        background: "var(--u-bg-raised)",
        border: `1px solid ${isHead ? color : "var(--u-line)"}`,
        boxShadow: isHead ? `inset 3px 0 0 ${color}` : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span className="mono" style={{ fontWeight: 700, color }}>
          {revision.changeId.slice(0, 2)}
          <span className="ter" style={{ fontWeight: 400 }}>
            {revision.changeId.slice(2, 8)}
          </span>
        </span>
        {isHead && <span className="pill">@</span>}
        {revision.isEmpty && <span className="pill">empty</span>}
        {revision.hasConflict && (
          <span className="pill" data-kind="conflict">
            conflict
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 12,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {revision.description.split("\n")[0] || (
          <span className="sec" style={{ fontStyle: "italic" }}>
            (no description set)
          </span>
        )}
      </div>
      <div className="sec" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
        <span
          className="avatar"
          style={{ background: color, width: 16, height: 16, fontSize: 8 }}
        >
          {authorInitials(revision.committer.name, revision.committer.email)}
        </span>
        <span style={{ flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {revision.committer.name || revision.committer.email}
        </span>
        {/* Committer time moves on every snapshot: "last touched", not "created". */}
        <span>{relativeTime(revision.committer.timestamp)}</span>
      </div>
    </button>
  );
}

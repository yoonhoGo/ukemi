import type { ChangeId, RebaseMode, Revision } from "@ukemi/domain";
import { t, tParts } from "../i18n/i18n.ts";
import { nodeColor } from "./change-color.ts";
import type { DragState } from "./drag-rebase.tsx";

const MODES: { mode: RebaseMode; key: string; label: string }[] = [
  { mode: "revision", key: "R", label: "This revision only" },
  { mode: "source", key: "S", label: "With its descendants" },
  { mode: "branch", key: "B", label: "Its whole branch" },
];

/** jj flag for a mode, so the HUD can print the command it will actually run. */
const FLAG: Record<RebaseMode, string> = {
  revision: "-r",
  source: "-s",
  branch: "-b",
};

/**
 * The drag-rebase heads-up display.
 *
 * The differentiator here is not the drag — GG already drags — it is that the
 * consequence is stated before the drop: how many revisions each mode moves,
 * and the exact `jj rebase` that will run. The counts come from jj, so they are
 * facts rather than guesses.
 *
 * There is deliberately no conflict prediction. Nothing short of performing the
 * rebase can know, and a fabricated "1 conflict resolves" would be worse than
 * silence. What the panel promises instead is the true thing: it is one ⌘Z
 * away, because every jj operation is.
 */
export function RebaseHud({
  drag,
  moved,
  dragged,
  target,
  blocked,
}: {
  drag: DragState;
  moved: Record<RebaseMode, ChangeId[] | undefined>;
  dragged: Revision | undefined;
  target: Revision | undefined;
  blocked: boolean;
}) {
  const short = (id: ChangeId | undefined) => id?.slice(0, 8) ?? "…";
  const command = drag.onto
    ? `jj rebase ${FLAG[drag.mode]} ${short(drag.rev)} --onto ${short(drag.onto)}`
    : "jj rebase …";
  // Split around the placeholder so the key chip keeps its styling and the
  // translation decides which side of it the words land on.
  const undoHint = tParts("always one {key}", "key");
  const releaseHint = tParts("Release to rebase · {key} cancel", "key");

  return (
    <div
      style={{
        position: "fixed",
        // Clear of the inspector: the design's preview artboard is a 1000px
        // frame with no inspector, so its `right: 20` lands on top of one here.
        right: 392,
        top: 72,
        width: 340,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: 10,
        borderRadius: 12,
        zIndex: 60,
        background: "var(--u-bg-toolbar)",
        boxShadow: "0 0 0 1px var(--u-line), 0 12px 30px rgba(0,0,0,0.16)",
      }}
    >
      <div className="side-head" style={{ padding: "2px 4px 6px" }}>
        {t("WHAT MOVES · hold a key to switch")}
      </div>
      {MODES.map((option) => {
        const count = moved[option.mode]?.length;
        const active = option.mode === drag.mode;
        return (
          <div
            key={option.mode}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              height: 34,
              padding: "0 10px",
              borderRadius: 7,
              ...(active
                ? { background: "var(--u-accent)", color: "var(--u-accent-ink)" }
                : {}),
            }}
          >
            <span
              className="key"
              {...(active
                ? {
                    style: {
                      background: "rgba(255,255,255,0.22)",
                      borderColor: "rgba(255,255,255,0.3)",
                      color: "var(--u-accent-ink)",
                    },
                  }
                : {})}
            >
              {option.key}
            </span>
            <span style={{ flexGrow: 1, fontWeight: active ? 500 : 400 }}>{t(option.label)}</span>
            <span
              style={{ fontSize: 11, ...(active ? { opacity: 0.85 } : {}) }}
              className={active ? undefined : "sec"}
            >
              {count === undefined
                ? "…"
                : count === 1
                  ? t("1 change")
                  : t("{count} changes", { count })}
            </span>
          </div>
        );
      })}

      <div style={{ height: 1, background: "var(--u-line)", margin: "6px 4px" }} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          padding: "2px 4px 4px",
          fontSize: 12,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <span className="ter" style={{ width: 50, flexShrink: 0 }}>
            {t("Command")}
          </span>
          <span className="mono selectable" style={{ fontSize: 11 }}>
            {command}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <span className="ter" style={{ width: 50, flexShrink: 0 }}>
            {t("Onto")}
          </span>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
            {blocked ? (
              <span style={{ color: "var(--u-conflict)" }}>
                {t("Cannot rebase onto its own descendant")}
              </span>
            ) : target ? (
              <>
                <span
                  className="mono"
                  style={{ color: nodeColor(target), fontWeight: 600 }}
                >
                  {short(target.changeId)}
                </span>{" "}
                {target.description.split("\n")[0] || t("(no description set)")}
              </>
            ) : (
              <span className="sec">{t("Drop on a revision")}</span>
            )}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <span className="ter" style={{ width: 50, flexShrink: 0 }}>
            {t("Undo")}
          </span>
          <span>
            {undoHint[0]}
            <span className="key">⌘Z</span>
            {undoHint[1]}
          </span>
        </div>
      </div>

      {dragged && (
        <div className="sec" style={{ padding: "2px 4px", fontSize: 11 }}>
          {releaseHint[0]}
          <span className="key">esc</span>
          {releaseHint[1]}
        </div>
      )}
    </div>
  );
}

/** The row that follows the pointer while dragging. */
export function DragGhost({ drag, revision }: { drag: DragState; revision: Revision }) {
  return (
    <div
      style={{
        position: "fixed",
        left: drag.x + 14,
        top: drag.y - 18,
        display: "flex",
        alignItems: "center",
        gap: 10,
        maxWidth: 460,
        height: 36,
        padding: "0 12px",
        borderRadius: 8,
        zIndex: 70,
        pointerEvents: "none",
        background: "var(--u-bg-raised)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.22), 0 0 0 1px var(--u-line)",
        transform: "rotate(-0.6deg)",
      }}
    >
      <span className="mono">
        <span style={{ color: nodeColor(revision), fontWeight: 700 }}>
          {revision.changeId.slice(0, 2)}
        </span>
        <span className="ter">{revision.changeId.slice(2, 8)}</span>
      </span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {revision.description.split("\n")[0] || t("(no description set)")}
      </span>
    </div>
  );
}

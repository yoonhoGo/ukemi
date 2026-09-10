import { useMemo, useRef, useState } from "react";
import type { ChangeId, GraphLayout, GraphRow, PullRequest, Revision } from "@ukemi/domain";
import { ELIDED_ROW, stackHeads } from "@ukemi/domain";
import { t } from "../i18n/i18n.ts";
import { PrLabel } from "./Stack.tsx";
import { authorColor, authorInitials, colorForChange, nodeColor } from "./change-color.ts";
import {
  edgePath,
  elidedPath,
  gutterWidth,
  laneX,
  NODE_R,
  ROW,
  rowY,
} from "./graph-geometry.ts";
import { popupBookmarkMenu, popupRowMenu } from "./menu.ts";
import { relativeTime } from "./time.ts";
import { ROW_ATTRIBUTE } from "./drag-rebase.tsx";

function Lanes({ layout, width }: { layout: GraphLayout; width: number }) {
  const height = Math.max(layout.rows.length * ROW, ROW);
  const heads = useMemo(() => stackHeads(layout.rows.map((row) => row.revision)), [layout]);
  const paths = useMemo(() => {
    const out: { key: string; d: string; color: string; elided: boolean }[] = [];
    for (const row of layout.rows) {
      for (const edge of row.edges) {
        // An edge is coloured by the head of the stack the *child* belongs to,
        // so one thread keeps one colour from its tip down to where it joins
        // its base — a dot is a change, a line is the stack through it.
        const color = row.revision.isImmutable
          ? nodeColor(row.revision)
          : colorForChange(heads.get(row.revision.changeId) ?? row.revision.changeId);
        out.push(
          edge.toRow === ELIDED_ROW
            ? {
                key: `${row.revision.changeId}-${edge.toChangeId}`,
                d: elidedPath(edge.fromLane, row.row),
                color,
                elided: true,
              }
            : {
                key: `${row.revision.changeId}-${edge.toChangeId}`,
                d: edgePath(edge.fromLane, row.row, edge.toLane, edge.toRow),
                color,
                elided: false,
              },
        );
      }
    }
    return out;
  }, [layout, heads]);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
      aria-hidden
    >
      {paths.map((path) => (
        <path
          key={path.key}
          d={path.d}
          stroke={path.color}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          {...(path.elided ? { strokeDasharray: "2 3", opacity: 0.5 } : {})}
        />
      ))}
      {layout.rows.map((row) => (
        <Node key={row.revision.changeId} row={row} />
      ))}
    </svg>
  );
}

/**
 * One node.
 *
 * Shape carries meaning that colour cannot: the working copy is a diamond
 * because it is the one revision that is *you*, and an empty revision is
 * hollow because there is nothing in it yet. Both stay legible to anyone who
 * cannot separate the palette's hues.
 */
function Node({ row }: { row: GraphRow }) {
  const { revision } = row;
  const x = laneX(row.lane);
  const y = rowY(row.row);
  const color = nodeColor(revision);

  // A conflict is data, not a blocked state: it is marked on the node and the
  // graph keeps going (design §4.3). The halo is drawn under both shapes
  // below, because the working copy is the one place a conflict must never be
  // hidden — and it is exactly where an `isWorkingCopy`-first branch would
  // hide it.
  const halo = revision.hasConflict ? (
    <circle cx={x} cy={y} r={NODE_R + 3.5} fill="var(--u-conflict-soft)" />
  ) : null;

  if (revision.isWorkingCopy) {
    return (
      <g>
        {halo}
        <rect
          x={x - 7}
          y={y - 7}
          width={14}
          height={14}
          rx={3}
          transform={`rotate(45 ${x} ${y})`}
          fill={revision.hasConflict ? "var(--u-conflict)" : color}
          stroke="var(--u-bg-window)"
          strokeWidth={2}
        />
      </g>
    );
  }

  if (revision.hasConflict) {
    return (
      <g>
        {halo}
        <circle
          cx={x}
          cy={y}
          r={NODE_R}
          fill="var(--u-conflict)"
          stroke="var(--u-bg-window)"
          strokeWidth={2}
        />
      </g>
    );
  }

  return (
    <circle
      cx={x}
      cy={y}
      r={NODE_R}
      fill={revision.isEmpty ? "var(--u-bg-window)" : color}
      stroke={revision.isEmpty ? color : "var(--u-bg-window)"}
      strokeWidth={revision.isEmpty ? 2.5 : 2}
    />
  );
}

function Row({
  revision,
  selected,
  onSelect,
  onDragStart,
  onBookmarkDragStart,
  onBookmarkDelete,
  moving,
  isTarget,
  targetLabel,
  targetBlocked,
  pr,
  onHover,
}: {
  revision: Revision;
  /** Pointer rested on or left the row; `undefined` clears the hover card. */
  onHover(changeId: ChangeId | undefined, event: React.PointerEvent): void;
  /** The PR whose head is one of this revision's bookmarks. */
  pr: PullRequest | undefined;
  selected: boolean;
  onSelect(changeId: ChangeId): void;
  onDragStart(changeId: ChangeId, event: React.PointerEvent): void;
  onBookmarkDragStart(name: string, from: ChangeId, event: React.PointerEvent): void;
  onBookmarkDelete(name: string): void;
  /** Ghosted because a pending rebase would move it. */
  moving: boolean;
  isTarget: boolean;
  targetLabel: string;
  targetBlocked: boolean;
}) {
  const color = nodeColor(revision);
  return (
    <button
      type="button"
      className="row"
      role="option"
      aria-selected={selected}
      // The pointer is mapped back to a revision through this attribute during
      // a drag; per-row enter events do not fire once the source row has
      // implicit pointer capture.
      {...{ [ROW_ATTRIBUTE]: revision.changeId }}
      onClick={() => onSelect(revision.changeId)}
      // A drag is a primary-button gesture; the right button belongs to the
      // row menu below, and without this ⌥right-click would arm a rebase.
      onPointerDown={(event) => {
        onHover(undefined, event);
        if (event.button === 0) onDragStart(revision.changeId, event);
      }}
      onPointerEnter={(event) => onHover(revision.changeId, event)}
      onPointerLeave={(event) => onHover(undefined, event)}
      onContextMenu={(event) => {
        // Select first. Every item in that menu fires its own chord and the
        // window's map acts on the *selection*, so a menu opened on a row that
        // was not selected yet would otherwise apply to the previous one.
        onSelect(revision.changeId);
        // The row's own menu replaces the web view's, the way the app menu
        // replaces the default one. Under plain `vite` neither appears.
        event.preventDefault();
        void popupRowMenu();
      }}
      style={{
        ...(moving ? { opacity: 0.45 } : {}),
        ...(isTarget
          ? {
              boxShadow: `inset 0 0 0 1.5px ${
                targetBlocked ? "var(--u-conflict)" : "var(--u-accent)"
              }`,
              background: targetBlocked ? "var(--u-conflict-soft)" : "var(--u-accent-soft)",
            }
          : {}),
      }}
    >
      <div />
      <div className="mono">
        {/* jj prints the unique prefix of a change ID emphasised; the rest is
            noise until you need to disambiguate, so it recedes. */}
        <span style={{ color, fontWeight: 700 }}>{revision.changeId.slice(0, 2)}</span>
        <span className="ter">{revision.changeId.slice(2, 8)}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {revision.description ? (
          <span
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {revision.description.split("\n")[0]}
          </span>
        ) : (
          /* No italic: Hangul has no true italic face, so a browser shears
             the glyphs and the row reads as broken. The parentheses and the
             secondary ink are how the inspector and the rebase HUD already
             mark this same placeholder. */
          <span
            className="sec"
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {t("(no description set)")}
          </span>
        )}
        {revision.isWorkingCopy && <span className="pill">{t("working copy")}</span>}
        {revision.hasConflict && (
          <span className="pill" data-kind="conflict">
            {t("conflict")}
          </span>
        )}
        {revision.isDivergent && <span className="pill">{t("divergent")}</span>}
        {isTarget && !targetBlocked && (
          <span
            className="pill"
            style={{ background: "var(--u-accent)", color: "var(--u-accent-ink)" }}
          >
            {targetLabel}
          </span>
        )}
      </div>
      {/* Clipped, because this is the column that narrows first when the
          graph is wide: a name that no longer fits is cut off rather than
          spilling over the row's next column. */}
      <div style={{ display: "flex", gap: 4, minWidth: 0, overflow: "hidden" }}>
        {revision.bookmarks.map((name) => (
          /* Drag it to another row to move the bookmark there. `cursor: grab`
             is the whole affordance — a name on a commit is the one thing in
             the graph you move by hand rather than by command. */
          <span
            className="pill"
            data-kind="bookmark"
            key={name}
            style={{ cursor: "grab" }}
            title={t("Drag {name} onto a revision to move it there.", { name })}
            onPointerDown={(event) => {
              if (event.button === 0) onBookmarkDragStart(name, revision.changeId, event);
            }}
            // Right-click on the pill deletes the name it shows. No
            // confirmation: ⌘Z is the way back from this the way it is from
            // every other write in the window, and the pill reappears where it
            // was. `stopPropagation` because the row underneath has a menu of
            // its own and both would otherwise pop.
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void popupBookmarkMenu(name, () => onBookmarkDelete(name));
            }}
          >
            {name}
          </span>
        ))}
        {/* A remote name the local bookmark has drifted from. Muted and not
            draggable: `main@origin` is the remote's opinion, and the way to
            move it is a push, not a hand. */}
        {revision.remoteBookmarks.map((name) => (
          <span
            className="pill"
            data-kind="remote-bookmark"
            key={name}
            title={t("{name} sits here; the local bookmark does not.", { name })}
          >
            {name}
          </span>
        ))}
        {revision.tags.map((name) => (
          <span className="pill" key={name}>
            {name}
          </span>
        ))}
        {pr && (
          <span className="pill" data-kind="pr" data-state={pr.state} title={pr.title}>
            <PrLabel pr={pr} />
          </span>
        )}
      </div>
      <div
        className="avatar"
        style={{ background: authorColor(revision.author.email) }}
        title={`${revision.author.name} <${revision.author.email}>`}
      >
        {authorInitials(revision.author.name, revision.author.email)}
      </div>
      <div className="sec" style={{ textAlign: "right", fontSize: "var(--u-font-size-small)" }}>
        {relativeTime(revision.author.timestamp)}
      </div>
    </button>
  );
}

/**
 * The row shows one line of the description and the inspector needs a click;
 * resting the pointer is the zero-cost way to read the rest without moving the
 * selection. One card, owned by `Graph`, so hovering a second row replaces
 * rather than stacks. Clamped to the viewport by width alone.
 * ponytail: no flip-above logic — the card is capped in height and nudged up
 * when it would run off the bottom.
 */
function HoverCard({ revision, x, y }: { revision: Revision; x: number; y: number }) {
  const width = 380;
  const left = Math.min(x + 14, window.innerWidth - width - 12);
  const top = Math.min(y + 14, Math.max(12, window.innerHeight - 320));
  const color = nodeColor(revision);
  const names = [...revision.bookmarks, ...revision.remoteBookmarks, ...revision.tags];
  return (
    <div
      role="tooltip"
      style={{
        position: "fixed",
        left,
        top,
        width,
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "10px 12px",
        borderRadius: "var(--u-radius-lg)",
        background: "var(--u-bg-raised)",
        border: "1px solid var(--u-line-strong)",
        boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
        pointerEvents: "none",
        fontSize: "var(--u-font-size-small)",
      }}
    >
      <div
        className="u-scroll"
        style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 200, fontSize: 12.5 }}
      >
        {revision.description || <span className="sec">{t("(no description set)")}</span>}
      </div>
      {names.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {revision.bookmarks.map((name) => (
            <span className="pill" data-kind="bookmark" key={name}>
              {name}
            </span>
          ))}
          {revision.remoteBookmarks.map((name) => (
            <span className="pill" data-kind="remote-bookmark" key={name}>
              {name}
            </span>
          ))}
          {revision.tags.map((name) => (
            <span className="pill" key={name}>
              {name}
            </span>
          ))}
        </div>
      )}
      <div className="mono sec" style={{ display: "flex", gap: 10 }}>
        <span>
          <span style={{ color, fontWeight: 700 }}>{revision.changeId.slice(0, 2)}</span>
          {revision.changeId.slice(2, 12)}
        </span>
        <span className="ter">{revision.commitId.slice(0, 7)}</span>
      </div>
      <div className="sec" style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span
          className="avatar"
          style={{
            background: authorColor(revision.author.email),
            display: "inline-flex",
            width: 16,
            height: 16,
            fontSize: 8,
            flexShrink: 0,
          }}
        >
          {authorInitials(revision.author.name, revision.author.email)}
        </span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {revision.author.name} &lt;{revision.author.email}&gt;
        </span>
        <span style={{ flexGrow: 1 }} />
        <span style={{ flexShrink: 0 }} title={t("Authored")}>
          {new Date(revision.author.timestamp).toLocaleString()}
        </span>
      </div>
    </div>
  );
}

export function Graph({
  layout,
  selected,
  onSelect,
  onDragStart,
  onBookmarkDragStart,
  onBookmarkDelete,
  moving,
  target,
  targetLabel,
  targetBlocked,
  pullRequests,
}: {
  layout: GraphLayout;
  /** PRs by head branch; a revision shows the one on its bookmark. */
  pullRequests?: ReadonlyMap<string, PullRequest> | undefined;
  selected: ChangeId | undefined;
  onSelect(changeId: ChangeId): void;
  onDragStart(changeId: ChangeId, event: React.PointerEvent): void;
  onBookmarkDragStart(name: string, from: ChangeId, event: React.PointerEvent): void;
  onBookmarkDelete(name: string): void;
  /** Revisions a pending rebase would move; ghosted while dragging. */
  moving?: ReadonlySet<ChangeId> | undefined;
  target?: ChangeId | undefined;
  /** What the target row is about to become; a rebase target is a new parent. */
  targetLabel?: string | undefined;
  targetBlocked?: boolean | undefined;
}) {
  // The gutter widens with the graph so lanes never overlap the change column.
  // `App` sets `--u-row-gutter` from the same number, so the lanes drawn here
  // and the rows' first column land on the same width.
  const gutter = gutterWidth(layout.laneCount);

  // Armed on enter, fired after a rest, cleared on leave or press: a card that
  // flashed on every row the pointer crossed would be noise, not a tooltip.
  const [hover, setHover] = useState<{ changeId: ChangeId; x: number; y: number } | undefined>();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onHover = (changeId: ChangeId | undefined, event: React.PointerEvent) => {
    clearTimeout(timer.current);
    if (changeId === undefined) {
      setHover(undefined);
      return;
    }
    const { clientX: x, clientY: y } = event;
    timer.current = setTimeout(() => setHover({ changeId, x, y }), 450);
  };
  const hovered = hover && layout.rows.find((row) => row.revision.changeId === hover.changeId);

  return (
    <div
      className="u-scroll"
      style={{ position: "relative", flexGrow: 1, minHeight: 0 }}
      role="listbox"
      aria-label={t("Revisions")}
    >
      <div style={{ position: "relative", paddingRight: 6 }}>
        <Lanes layout={layout} width={gutter} />
        {layout.rows.map((row) => (
          <Row
            key={row.revision.changeId}
            revision={row.revision}
            selected={row.revision.changeId === selected}
            onSelect={onSelect}
            onDragStart={onDragStart}
            onBookmarkDragStart={onBookmarkDragStart}
            onBookmarkDelete={onBookmarkDelete}
            moving={moving?.has(row.revision.changeId) ?? false}
            isTarget={row.revision.changeId === target}
            targetLabel={targetLabel ?? t("new parent")}
            targetBlocked={targetBlocked ?? false}
            pr={row.revision.bookmarks.map((b) => pullRequests?.get(b)).find(Boolean)}
            onHover={onHover}
          />
        ))}
      </div>
      {hovered && hover && <HoverCard revision={hovered.revision} x={hover.x} y={hover.y} />}
    </div>
  );
}

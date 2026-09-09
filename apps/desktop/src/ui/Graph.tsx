import { useMemo } from "react";
import type { ChangeId, GraphLayout, GraphRow, Revision } from "@ukemi/domain";
import { ELIDED_ROW } from "@ukemi/domain";
import { authorInitials, nodeColor } from "./change-color.ts";
import {
  edgePath,
  elidedPath,
  gutterWidth,
  laneX,
  NODE_R,
  ROW,
  rowY,
} from "./graph-geometry.ts";
import { relativeTime } from "./time.ts";

function Lanes({ layout, width }: { layout: GraphLayout; width: number }) {
  const height = Math.max(layout.rows.length * ROW, ROW);
  const paths = useMemo(() => {
    const out: { key: string; d: string; color: string; elided: boolean }[] = [];
    for (const row of layout.rows) {
      for (const edge of row.edges) {
        // An edge is coloured by the *child* whose lane it leaves, so a stack
        // keeps one colour from its tip down to where it joins its base.
        const color = nodeColor(row.revision);
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
  }, [layout]);

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
}: {
  revision: Revision;
  selected: boolean;
  onSelect(changeId: ChangeId): void;
}) {
  const color = nodeColor(revision);
  return (
    <button
      type="button"
      className="row"
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(revision.changeId)}
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
          <span className="sec" style={{ fontStyle: "italic" }}>
            (no description set)
          </span>
        )}
        {revision.isWorkingCopy && <span className="pill">working copy</span>}
        {revision.hasConflict && (
          <span className="pill" data-kind="conflict">
            conflict
          </span>
        )}
        {revision.isDivergent && <span className="pill">divergent</span>}
      </div>
      <div style={{ display: "flex", gap: 4, minWidth: 0 }}>
        {revision.bookmarks.map((name) => (
          <span className="pill" data-kind="bookmark" key={name}>
            {name}
          </span>
        ))}
        {revision.tags.map((name) => (
          <span className="pill" key={name}>
            {name}
          </span>
        ))}
      </div>
      <div
        className="avatar"
        style={{ background: color }}
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

export function Graph({
  layout,
  selected,
  onSelect,
}: {
  layout: GraphLayout;
  selected: ChangeId | undefined;
  onSelect(changeId: ChangeId): void;
}) {
  // The gutter widens with the graph so lanes never overlap the change column.
  const gutter = gutterWidth(layout.laneCount);
  return (
    <div
      className="u-scroll"
      style={{ position: "relative", flexGrow: 1, minHeight: 0 }}
      role="listbox"
      aria-label="Revisions"
    >
      <div
        style={
          {
            position: "relative",
            paddingRight: 6,
            "--u-row-gutter": `${gutter}px`,
          } as React.CSSProperties
        }
      >
        <Lanes layout={layout} width={gutter} />
        {layout.rows.map((row) => (
          <Row
            key={row.revision.changeId}
            revision={row.revision}
            selected={row.revision.changeId === selected}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef } from "react";
import type { Operation } from "@ukemi/domain";
import { useJjMutation, useOperations, useRepo } from "../repo.tsx";
import { clockTime, relativeTime } from "./time.ts";

/**
 * The operation timeline — differentiator #1 (design §4.1).
 *
 * Every read in the window is keyed on an operation ID, so scrubbing is not a
 * preview mode with its own code path: parking the pin on a past operation
 * makes the whole window re-read at that point in time. Git's reflog cannot do
 * this because it tracks refs, not repository states.
 *
 * Nothing is written until "Restore here", which is why dragging the playhead
 * is safe to do idly.
 */
export function Timeline() {
  const { pinnedOpId, isPinned, pin } = useRepo();
  const operations = useOperations(60);
  const undo = useJjMutation((port) => port.undo());
  const restore = useJjMutation((port, opId: string) => port.restoreOperation(opId));

  // Oldest on the left, so the axis runs the way time does.
  const ordered = useMemo(
    () => (operations.data ? [...operations.data].reverse() : []),
    [operations.data],
  );

  // The axis runs oldest-to-newest, so it opens scrolled to its far end: the
  // present is where the user is, and a timeline that opens on last week's
  // operations hides the playhead entirely.
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = track.current;
    if (!element || isPinned) return;
    element.scrollLeft = element.scrollWidth;
  }, [ordered.length, isPinned]);

  const activeIndex = pinnedOpId
    ? ordered.findIndex((operation) => operation.id === pinnedOpId)
    : ordered.length - 1;

  const step = (delta: number) => {
    const next = ordered[Math.min(ordered.length - 1, Math.max(0, activeIndex + delta))];
    if (!next) return;
    // Landing on the newest operation means "back to now": drop the pin
    // entirely rather than pinning to head, so writes are enabled again.
    pin(next.id === ordered[ordered.length - 1]?.id ? undefined : next.id);
  };

  return (
    <div
      style={{
        height: 92,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--u-bg-timeline)",
        borderTop: "1px solid var(--u-line-strong)",
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", height: 30, padding: "0 14px", gap: 12 }}
      >
        <span className="side-head" style={{ padding: 0 }}>
          OPERATIONS
        </span>
        <span className="sec" style={{ fontSize: "var(--u-font-size-small)" }}>
          {isPinned
            ? "Viewing a past state. Nothing has changed yet."
            : "Drag the playhead to preview any past state. Nothing changes until you restore."}
        </span>
        <span style={{ flexGrow: 1 }} />
        {isPinned && (
          <button type="button" className="tb-btn" style={btn} onClick={() => pin(undefined)}>
            Back to now <span className="key">Esc</span>
          </button>
        )}
        <button
          type="button"
          className="tb-btn"
          style={btn}
          disabled={isPinned || undo.isPending}
          title={isPinned ? "Return to now to undo" : "Undo the last operation"}
          onClick={() => undo.mutate(undefined)}
        >
          Undo <span className="key">⌘Z</span>
        </button>
        <button
          type="button"
          className="tb-btn"
          style={btn}
          disabled={!isPinned || restore.isPending}
          title={
            isPinned
              ? "Restore the repository to this operation"
              : "Park the playhead on a past operation first"
          }
          onClick={() => pinnedOpId && restore.mutate(pinnedOpId)}
        >
          Restore here <span className="key">⌘⇧R</span>
        </button>
      </div>

      <div
        ref={track}
        className="u-scroll"
        style={{ flexGrow: 1, margin: "0 14px 10px", overflowY: "hidden" }}
        role="slider"
        tabIndex={0}
        aria-label="Operation timeline"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, ordered.length - 1)}
        aria-valuenow={Math.max(0, activeIndex)}
        aria-valuetext={ordered[activeIndex]?.description ?? "now"}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            step(-1);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            step(1);
          }
        }}
      >
        <Track operations={ordered} activeIndex={activeIndex} onPick={pin} isPinned={isPinned} />
      </div>
    </div>
  );
}

const TICK_PITCH = 150;

function Track({
  operations,
  activeIndex,
  onPick,
  isPinned,
}: {
  operations: readonly Operation[];
  activeIndex: number;
  onPick(opId: string | undefined): void;
  isPinned: boolean;
}) {
  if (operations.length === 0) {
    return (
      <div className="sec" style={{ fontSize: "var(--u-font-size-small)" }}>
        No operations yet.
      </div>
    );
  }

  // Even spacing rather than true time spacing: op logs are bursty, and a
  // real time axis collapses a morning's work into one unclickable pixel.
  const width = operations.length * TICK_PITCH;
  const x = (index: number) => index * TICK_PITCH + TICK_PITCH / 2;
  const newest = operations.length - 1;

  return (
    <svg width={width} height={50} viewBox={`0 0 ${width} 50`} style={{ display: "block" }}>
      <line x1={0} y1={30} x2={width} y2={30} stroke="var(--u-line-strong)" strokeWidth={2} />
      {operations.map((operation, index) => {
        const active = index === activeIndex;
        const isNewest = index === newest;
        const label = operation.description.replace(/^(commit|snapshot) /, "");
        return (
          <g
            key={operation.id}
            onClick={() => onPick(isNewest ? undefined : operation.id)}
            style={{ cursor: "default" }}
          >
            {/* A generous invisible hit area — the dots are 4px. */}
            <rect
              x={x(index) - TICK_PITCH / 2}
              y={0}
              width={TICK_PITCH}
              height={50}
              fill="transparent"
            />
            <text
              x={x(index)}
              y={14}
              textAnchor="middle"
              fontSize={10.5}
              fill={active ? "var(--u-accent)" : "var(--u-text-secondary)"}
              fontWeight={active ? 600 : 400}
              style={{ fontFamily: "var(--u-font)" }}
            >
              {label.length > 22 ? `${label.slice(0, 21)}…` : label}
            </text>
            <circle
              cx={x(index)}
              cy={30}
              r={active ? 6 : 4}
              fill={active ? "var(--u-accent)" : "var(--u-immutable)"}
              {...(active ? { stroke: "var(--u-bg-timeline)", strokeWidth: 2 } : {})}
            />
            <text
              x={x(index)}
              y={47}
              textAnchor="middle"
              fontSize={10.5}
              fill="var(--u-text-tertiary)"
              style={{ fontFamily: "var(--u-font)" }}
            >
              {isNewest && !isPinned ? "now" : clockTime(operation.time)}
            </text>
          </g>
        );
      })}
      <title>
        {operations[activeIndex]
          ? `${operations[activeIndex]!.description} · ${relativeTime(operations[activeIndex]!.time)}`
          : ""}
      </title>
    </svg>
  );
}

const btn: React.CSSProperties = { height: 24, fontSize: 12 };

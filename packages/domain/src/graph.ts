import type { ChangeId, GraphEdge, GraphRow, Revision } from "./types.ts";

export interface GraphLayout {
  readonly rows: readonly GraphRow[];
  /** Number of lanes in use; the renderer sizes its gutter from this. */
  readonly laneCount: number;
}

/** Row index used for an edge whose parent is outside the revset. */
export const ELIDED_ROW = -1;

/**
 * Assign lanes and edges to an ordered revision list.
 *
 * Pure: same input, same layout, no clock or repo access — which is what lets
 * the operation scrubber lay out a past state without touching the repo.
 *
 * Expects `revisions` in jj's topological order (children before parents), as
 * `jj log` emits. A lane is "occupied" from the row that declares a parent
 * down to the row where that parent appears, so a lane is a straight vertical
 * run and only the hand-off bends. Two children of one parent land on the same
 * lane, which is what makes a merge read as a join instead of two stubs.
 *
 * ponytail: leftmost-free-lane assignment, O(rows × lanes). A 10k-revision
 * revset with a wide fan-out could reorder lanes for a prettier picture; add a
 * proper lane-priority pass only if real repos look tangled.
 */
export function layoutGraph(revisions: readonly Revision[]): GraphLayout {
  const rowOf = new Map<ChangeId, number>();
  revisions.forEach((r, i) => rowOf.set(r.changeId, i));

  /** lanes[l] = the change ID that lane `l` is currently running down to. */
  const lanes: (ChangeId | null)[] = [];
  const rows: GraphRow[] = [];
  let laneCount = 0;

  const claimLane = (id: ChangeId): number => {
    const existing = lanes.indexOf(id);
    if (existing !== -1) return existing;
    const free = lanes.indexOf(null);
    const lane = free === -1 ? lanes.length : free;
    lanes[lane] = id;
    if (lane + 1 > laneCount) laneCount = lane + 1;
    return lane;
  };

  revisions.forEach((revision, row) => {
    // The lane a child already reserved for us, or a fresh one for a new head.
    let lane = lanes.indexOf(revision.changeId);
    if (lane === -1) {
      const free = lanes.indexOf(null);
      lane = free === -1 ? lanes.length : free;
      if (lane + 1 > laneCount) laneCount = lane + 1;
    }
    // Release it before claiming parents so the first parent can inherit it.
    lanes[lane] = null;

    const edges: GraphEdge[] = revision.parents.map((parent, i) => {
      // The first parent continues this lane; the rest branch out sideways.
      let toLane: number;
      if (i === 0 && lanes.indexOf(parent) === -1) {
        lanes[lane] = parent;
        toLane = lane;
      } else {
        toLane = claimLane(parent);
      }
      const target = rowOf.get(parent);
      return {
        toChangeId: parent,
        fromLane: lane,
        toLane,
        toRow: target ?? ELIDED_ROW,
        elided: target === undefined,
      };
    });

    rows.push({ revision, row, lane, edges });

    // Trim trailing empties so laneCount tracks real width, not high-water marks.
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
  });

  return { rows, laneCount };
}

/** Change IDs of every revision carrying a conflict, in row order. */
export function conflictedChanges(layout: GraphLayout): ChangeId[] {
  return layout.rows
    .filter((r) => r.revision.hasConflict)
    .map((r) => r.revision.changeId);
}

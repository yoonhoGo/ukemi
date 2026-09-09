/**
 * Graph geometry — pure, so it is testable and so a future theme-supplied
 * renderer (design §8 layer 3) has a narrow surface to reimplement.
 *
 * Kept in sync with `--u-row-height` / `--u-lane-*` in the theme contract.
 */
export const ROW = 44;
export const LANE_INSET = 40;
export const LANE_PITCH = 32;
export const GUTTER = 132;
export const NODE_R = 6;

export const laneX = (lane: number): number => LANE_INSET + lane * LANE_PITCH;
export const rowY = (row: number): number => ROW / 2 + row * ROW;

/** Gutter width that fits `laneCount` lanes without crowding the next column. */
export const gutterWidth = (laneCount: number): number =>
  Math.max(GUTTER, LANE_INSET + laneCount * LANE_PITCH + 8);

/**
 * The path from a revision down to one of its parents.
 *
 * A lane change bends immediately, in the row below the child, and then runs
 * straight down the *target* lane. Bending late instead — holding the child's
 * lane until just above the parent — draws the edge through whatever else has
 * since been given that lane: `layoutGraph` frees a lane as soon as its branch
 * joins another, exactly as `jj log` does when it prints `├─╯` and reuses the
 * column, so an edge held in the old lane collides with the next stack's nodes.
 *
 * Bending early is also the honest picture: the edge merges into the lane that
 * runs unbroken down to the parent, which is what "joins the trunk here" means.
 */
export function edgePath(
  fromLane: number,
  fromRow: number,
  toLane: number,
  toRow: number,
): string {
  const x1 = laneX(fromLane);
  const x2 = laneX(toLane);
  const y1 = rowY(fromRow);
  const y2 = rowY(toRow);
  if (x1 === x2) return `M${x1} ${y1} V ${y2}`;
  const bendEnd = Math.min(y1 + ROW, y2);
  const mid = (y1 + bendEnd) / 2;
  const bend = `M${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${bendEnd}`;
  return bendEnd < y2 ? `${bend} V ${y2}` : bend;
}

/** A parent outside the revset: a stub, so the history reads as continuing. */
export function elidedPath(lane: number, row: number): string {
  const x = laneX(lane);
  const y = rowY(row);
  return `M${x} ${y} V ${y + ROW * 0.6}`;
}

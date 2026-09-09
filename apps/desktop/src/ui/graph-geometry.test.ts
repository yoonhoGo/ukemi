import { test } from "node:test";
import assert from "node:assert/strict";
import { edgePath, laneX, rowY, ROW, gutterWidth } from "./graph-geometry.ts";

test("a same-lane edge is a plain vertical run", () => {
  assert.equal(edgePath(0, 0, 0, 1), `M${laneX(0)} ${rowY(0)} V ${rowY(1)}`);
});

test("an adjacent lane change is a single curve with no vertical tail", () => {
  const path = edgePath(1, 0, 0, 1);
  assert.match(path, /^M\d+ \d+ C /);
  assert.doesNotMatch(path, / V /, "a one-row hop needs no vertical segment");
});

test("a long lane change descends the TARGET lane, never the source lane", () => {
  // The regression this pins: layoutGraph frees a lane as soon as its branch
  // joins another, so an edge that lingered in the source lane would be drawn
  // straight through the next stack's nodes.
  const from = 1;
  const to = 0;
  const path = edgePath(from, 4, to, 7);
  const tail = path.slice(path.indexOf(" V "));
  assert.match(path, / V /, "a multi-row edge must have a vertical segment");
  // The bend completes one row below the child…
  assert.ok(
    path.includes(`${laneX(to)} ${rowY(4) + ROW}`),
    `bend should land in the row below the child: ${path}`,
  );
  // …and the vertical tail must reach the parent row.
  assert.equal(tail, ` V ${rowY(7)}`);
  // The source lane's x must not appear after the bend.
  assert.ok(
    !tail.includes(String(laneX(from))),
    `vertical tail must not sit in the source lane: ${path}`,
  );
});

test("the gutter grows with lane count but never shrinks below the base", () => {
  assert.equal(gutterWidth(1), 132);
  assert.ok(gutterWidth(8) > gutterWidth(2));
});

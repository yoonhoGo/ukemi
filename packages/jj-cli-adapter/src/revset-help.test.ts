import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRevsetFunctions } from "./revset-help.ts";

/**
 * The shape, without needing jj on PATH — `contract.test.ts` runs the real
 * `jj help -k revsets` through the same parser, so between them a format change
 * cannot pass unnoticed whether or not the binary is here.
 *
 * Every line below is copied out of jj 0.43's own output, including the two
 * things that make this worth parsing rather than eyeballing: a description
 * that wraps onto indented continuation lines, and sentences with periods
 * inside code spans.
 */
const HELP = `Revsets are written in a functional language.

* \`x-\`: Parents of \`x\`.

* \`parents(x, [depth])\`: \`parents(x)\` is the same as \`x-\`. If \`depth\` is
  specified, this selects the parents at the given depth.

* \`all()\`: All visible commits and ancestors of commits explicitly mentioned.

* \`bookmarks([pattern])\`: All local bookmark targets. If \`pattern\` is specified,
  this selects the bookmarks whose name match the given [string
  pattern](#string-patterns). For example, \`bookmarks(*push*)\` would match the
  bookmarks \`push-123\` and \`repushed\` but not the bookmark \`main\`.

* \`heads(x)\`: Commits in \`x\` that are not ancestors of other commits in \`x\`.
  Equivalent to \`x ~ ::x-\`.

## String patterns

* \`exact:"string"\`: Matches exactly.
`;

const parsed = parseRevsetFunctions(HELP);
const byName = new Map(parsed.map((fn) => [fn.name, fn]));

test("only the function entries are functions", () => {
  // `x-` is an operator and `exact:"string"` is a pattern; both are bulleted
  // the same way, and neither belongs in a palette of things you can call.
  assert.deepEqual(
    parsed.map((fn) => fn.name),
    ["parents", "all", "bookmarks", "heads"],
  );
});

test("the parameter list is kept as written", () => {
  assert.equal(byName.get("parents")?.params, "x, [depth]");
  assert.equal(byName.get("all")?.params, "");
  assert.equal(byName.get("bookmarks")?.params, "[pattern]");
});

test("the description is one sentence, wrapped lines joined, markdown off", () => {
  assert.equal(byName.get("bookmarks")?.about, "All local bookmark targets.");
  assert.equal(
    byName.get("all")?.about,
    "All visible commits and ancestors of commits explicitly mentioned.",
  );
  // A period inside a code span does not end the sentence, or `x ~ ::x-` and
  // `heads(all())` would each cut one in half.
  assert.equal(
    byName.get("heads")?.about,
    "Commits in x that are not ancestors of other commits in x.",
  );
  // A link keeps its text and loses its target. This one is in a later
  // sentence, so it only shows up if the first-sentence cut is wrong.
  assert.ok(!byName.get("bookmarks")?.about.includes("#string-patterns"));
});

test("a description that opens with its own name survives", () => {
  // `parents(x)` is a code span at the very start of the sentence, which is
  // where a naive backtick strip leaves a stray leading space.
  assert.equal(byName.get("parents")?.about, "parents(x) is the same as x-.");
});

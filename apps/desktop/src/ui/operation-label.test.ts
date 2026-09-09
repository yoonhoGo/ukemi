import { test } from "node:test";
import assert from "node:assert/strict";
import { LABELS, operationLabel } from "./operation-label.ts";

/**
 * The descriptions below are verbatim from `jj op log` on this repository, not
 * invented: the point of the function is that it matches what jj really writes,
 * so a fixture written from memory would test the wrong thing.
 */
test("names the operation kind and cuts the hash to jj's own short form", () => {
  assert.equal(operationLabel("snapshot working copy"), "Snapshot");
  assert.equal(operationLabel("new empty commit"), "New change");
  assert.equal(
    operationLabel("commit 8666c7c4ab9ca51da09441f2b1a4e0c3d5f6a7b8"),
    "Commit 8666c7c4",
  );
  assert.equal(
    operationLabel("describe commit 6b27fcd0da5298390a7f1c4b2e8d9a0f13456789"),
    "Describe 6b27fcd0",
  );
  assert.equal(
    operationLabel("squash commits into 02ae08104d67552962b8712f3a4c5d6e7f809123"),
    "Squash into 02ae0810",
  );
});

test("a two-part shape keeps the name as well as the id", () => {
  assert.equal(
    operationLabel("point bookmark main to commit 18ecb50812f4a6c3d9e0b7185a2c4d6e8f091234"),
    "Point main to 18ecb508",
  );
  assert.equal(operationLabel("push bookmark main to git remote origin"), "Push main");
});

test("an unmatched description survives, shortened rather than dropped", () => {
  // The ceiling named in `operation-label.ts`: an unlisted verb still reads,
  // and its hash is still cut, which is the whole reason the fallback is a
  // shortened description rather than a placeholder.
  assert.equal(
    operationLabel("abandon commit c0ffee1234567890abcdef1234567890abcdef12"),
    "abandon commit c0ffee12",
  );
  assert.equal(operationLabel(""), "");
});

test("only the first line reaches the tick", () => {
  assert.equal(operationLabel("push bookmark main to git remote origin\ntrailer"), "Push main");
});

test("a short id is left alone, since jj already printed it short", () => {
  // Eight hex characters is not a hash to cut down; twelve is the threshold.
  assert.equal(operationLabel("commit abcdef12"), "Commit abcdef12");
});

test("no row leaves a placeholder unfilled", () => {
  // A label declaring {id} whose pattern captured nothing would put the braces
  // on the timeline. Every row is exercised above except split, which is here;
  // the assertion is that no output still contains a placeholder.
  assert.equal(
    operationLabel("split commit 5e1388b7c2a4d6e8f0912345678901234567890a"),
    "Split 5e1388b7",
  );
  const rendered = LABELS.map(([pattern]) => pattern.source);
  assert.equal(
    rendered.length,
    new Set(rendered).size,
    "two rows with the same pattern would make the second unreachable",
  );
});

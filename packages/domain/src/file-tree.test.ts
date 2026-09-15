import { test } from "node:test";
import assert from "node:assert/strict";
import { fileTree } from "./file-tree.ts";
import type { FileChange, FileTreeDirectory, FileTreeNode } from "./index.ts";

function change(path: string): FileChange {
  return { path, status: "modified" };
}

/** `a/b (2)` for a directory, `x.ts` for a file — the shape a row would draw. */
function outline(nodes: readonly FileTreeNode[]): unknown[] {
  return nodes.map((node) =>
    node.kind === "file"
      ? node.name
      : [`${node.name} (${node.fileCount})`, ...outline(node.children)],
  );
}

test("no changes make no tree", () => {
  assert.deepEqual(fileTree([]), []);
});

test("a file at the root is a row of its own", () => {
  assert.deepEqual(outline(fileTree([change("README.md")])), ["README.md"]);
});

test("a single nested path collapses to one directory row", () => {
  assert.deepEqual(outline(fileTree([change("a/b/c/x.ts")])), [["a/b/c (1)", "x.ts"]]);
});

test("siblings under one directory keep it as a single collapsed row", () => {
  assert.deepEqual(
    outline(fileTree([change("a/b/c/x.ts"), change("a/b/c/y.ts")])),
    [["a/b/c (2)", "x.ts", "y.ts"]],
  );
});

test("a chain stops collapsing where it branches, and again below the branch", () => {
  const tree = fileTree([change("a/b/c/x.ts"), change("a/b/d/e/y.ts")]);
  assert.deepEqual(outline(tree), [
    ["a/b (2)", ["c (1)", "x.ts"], ["d/e (1)", "y.ts"]],
  ]);
});

test("a directory holding a file does not swallow its subdirectory", () => {
  assert.deepEqual(
    outline(fileTree([change("a/x.ts"), change("a/b/y.ts")])),
    [["a (2)", ["b (1)", "y.ts"], "x.ts"]],
  );
});

test("directories sort before files, each by name", () => {
  const tree = fileTree([
    change("z.ts"),
    change("a.ts"),
    change("src/b.ts"),
    change("docs/c.md"),
  ]);
  assert.deepEqual(outline(tree), [
    ["docs (1)", "c.md"],
    ["src (1)", "b.ts"],
    "a.ts",
    "z.ts",
  ]);
});

test("a file and a directory of the same name sit side by side", () => {
  const tree = fileTree([change("a"), change("a/b.ts")]);
  assert.deepEqual(outline(tree), [["a (1)", "b.ts"], "a"]);
  assert.equal(tree[0]?.path, "a");
  assert.equal(tree[1]?.path, "a", "the file keeps its own path, collision and all");
});

test("deep nesting keeps every level's file count", () => {
  const tree = fileTree([
    change("a/b/c/d/e/f/x.ts"),
    change("a/b/c/d/e/g/y.ts"),
    change("a/b/c/d/e/g/z.ts"),
  ]);
  const top = tree[0] as FileTreeDirectory;
  assert.equal(top.name, "a/b/c/d/e");
  assert.equal(top.fileCount, 3);
  assert.deepEqual(
    top.children.map((c) => [c.name, c.kind === "directory" ? c.fileCount : 1]),
    [
      ["f", 1],
      ["g", 2],
    ],
  );
});

test("a file node carries the change it came from", () => {
  const renamed: FileChange = { path: "src/a.ts", status: "renamed", insertions: 3 };
  const tree = fileTree([renamed]);
  const dir = tree[0] as FileTreeDirectory;
  const file = dir.children[0];
  assert.equal(file?.kind === "file" && file.change, renamed);
});

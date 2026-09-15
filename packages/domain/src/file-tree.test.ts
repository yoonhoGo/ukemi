import { test } from "node:test";
import assert from "node:assert/strict";
import { fileTree, toggleFold, treeRows } from "./file-tree.ts";
import type {
  FileChange,
  FileTreeDirectory,
  FileTreeNode,
  FileTreeRow,
} from "./index.ts";

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

/** `a/b @0` for a directory, `x.ts @1` for a file — the row and its indent. */
function drawn(rows: readonly FileTreeRow[]): string[] {
  return rows.map(({ node, depth }) => `${node.name} @${depth}`);
}

const NESTED = fileTree([
  change("src/ui/a.ts"),
  change("src/ui/b.ts"),
  change("docs/c.md"),
  change("README.md"),
]);

test("nothing folded draws every node, one level in per directory", () => {
  assert.deepEqual(drawn(treeRows(NESTED, new Set())), [
    "docs @0",
    "c.md @1",
    "src/ui @0",
    "a.ts @1",
    "b.ts @1",
    "README.md @0",
  ]);
});

test("a folded directory keeps its own row and drops everything under it", () => {
  assert.deepEqual(drawn(treeRows(NESTED, new Set(["src/ui"]))), [
    "docs @0",
    "c.md @1",
    "src/ui @0",
    "README.md @0",
  ]);
});

test("folding an outer directory hides the inner one that was open", () => {
  const tree = fileTree([change("a/x.ts"), change("a/b/y.ts")]);
  assert.deepEqual(drawn(treeRows(tree, new Set())), [
    "a @0",
    "b @1",
    "y.ts @2",
    "x.ts @1",
  ]);
  assert.deepEqual(drawn(treeRows(tree, new Set(["a"]))), ["a @0"]);
});

test("a folded path that is not in the tree changes nothing", () => {
  assert.deepEqual(treeRows(NESTED, new Set(["nowhere"])), treeRows(NESTED, new Set()));
});

test("no nodes make no rows, folded or not", () => {
  assert.deepEqual(treeRows([], new Set()), []);
  assert.deepEqual(treeRows([], new Set(["a"])), []);
});

test("toggling a path adds it, toggling again takes it away", () => {
  const shut = toggleFold(new Set(), "src/ui");
  assert.deepEqual([...shut], ["src/ui"]);
  assert.deepEqual([...toggleFold(shut, "src/ui")], []);
  assert.deepEqual([...toggleFold(shut, "docs")].sort(), ["docs", "src/ui"]);
  assert.deepEqual([...shut], ["src/ui"], "the set handed in is not touched");
});

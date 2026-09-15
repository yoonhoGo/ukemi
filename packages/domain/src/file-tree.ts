import type { FileChange } from "./types.ts";

/**
 * One row of the file tree: a directory to expand, or a changed file.
 *
 * A file node carries its whole `FileChange` rather than a copy of the parts a
 * row happens to draw, so the status icon and the click handler a flat list
 * already had keep working unchanged when the list becomes a tree.
 */
export type FileTreeNode = FileTreeDirectory | FileTreeFile;

export interface FileTreeDirectory {
  readonly kind: "directory";
  /** What the row reads: several segments joined when a chain collapsed here. */
  readonly name: string;
  /** Path from the repo root — the stable key for expansion state. */
  readonly path: string;
  readonly children: readonly FileTreeNode[];
  /** Files anywhere below, which is the count a collapsed row has to show. */
  readonly fileCount: number;
}

export interface FileTreeFile {
  readonly kind: "file";
  readonly name: string;
  readonly path: string;
  readonly change: FileChange;
}

/** The tree under construction: directories by segment, files at this level. */
interface Pending {
  readonly dirs: Map<string, Pending>;
  readonly files: FileChange[];
}

/**
 * Group changed paths into a directory tree.
 *
 * A directory with exactly one child directory and no files of its own is
 * merged into that child, so `a/b/c/x.ts` and `a/b/c/y.ts` read as one `a/b/c`
 * row instead of three rows that each hold nothing but the next. Fork and
 * Tower both do this, and for the same reason: in a repo with deep source
 * roots the uncollapsed tree is mostly empty rows.
 *
 * Root-level files come back alongside the directories, sorted after them.
 */
export function fileTree(changes: readonly FileChange[]): FileTreeNode[] {
  const root: Pending = { dirs: new Map(), files: [] };
  for (const change of changes) {
    const segments = change.path.split("/");
    segments.pop(); // the file name; only the directories are walked
    let cursor = root;
    for (const segment of segments) {
      let next = cursor.dirs.get(segment);
      if (!next) {
        next = { dirs: new Map(), files: [] };
        cursor.dirs.set(segment, next);
      }
      cursor = next;
    }
    cursor.files.push(change);
  }
  return childrenOf(root, "");
}

function childrenOf(pending: Pending, prefix: string): FileTreeNode[] {
  const dirs = [...pending.dirs].map(([name, child]) =>
    directory(name, prefix + name, child),
  );
  const files: FileTreeFile[] = pending.files.map((change) => ({
    kind: "file",
    name: change.path.slice(change.path.lastIndexOf("/") + 1),
    path: change.path,
    change,
  }));
  // Directories first, then files, each by name. Plain code-point order rather
  // than a locale compare: the same repo has to produce the same tree wherever
  // the app runs.
  const byName = (a: FileTreeNode, b: FileTreeNode) => (a.name < b.name ? -1 : 1);
  return [...dirs.sort(byName), ...files.sort(byName)];
}

function directory(name: string, path: string, pending: Pending): FileTreeDirectory {
  const only = pending.files.length === 0 && pending.dirs.size === 1
    ? [...pending.dirs][0]
    : undefined;
  if (only) return directory(`${name}/${only[0]}`, `${path}/${only[0]}`, only[1]);

  const children = childrenOf(pending, `${path}/`);
  const fileCount = children.reduce(
    (n, child) => n + (child.kind === "file" ? 1 : child.fileCount),
    0,
  );
  return { kind: "directory", name, path, children, fileCount };
}

/** One drawn row: a node and how far in it sits. */
export interface FileTreeRow {
  readonly node: FileTreeNode;
  readonly depth: number;
}

/**
 * The tree flattened into the rows to draw, with everything under a folded
 * directory left out.
 *
 * Flat rather than nested `<details>` elements, which is what the sidebar uses
 * and would hand over the fold state, the chevron and the disclosure
 * semantics for free: the diff sheet's ↑↓ walks the files *as drawn*, so it
 * needs one ordered list of what is currently on screen, and a nested render
 * has no such list to hand it.
 */
export function treeRows(
  nodes: readonly FileTreeNode[],
  folded: ReadonlySet<string>,
  depth = 0,
): FileTreeRow[] {
  return nodes.flatMap((node) =>
    node.kind === "directory" && !folded.has(node.path)
      ? [{ node, depth }, ...treeRows(node.children, folded, depth + 1)]
      : [{ node, depth }],
  );
}

/**
 * Fold a directory shut, or open one that is.
 *
 * Folded directories are the ones listed, the way the sidebar lists its
 * collapsed sections, so "everything open" is the empty set and a directory
 * nobody has touched needs no entry.
 */
export function toggleFold(
  folded: ReadonlySet<string>,
  path: string,
): ReadonlySet<string> {
  const next = new Set(folded);
  if (!next.delete(path)) next.add(path);
  return next;
}

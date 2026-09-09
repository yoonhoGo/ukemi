import type { FileStatus } from "./types.ts";

/**
 * Unified-diff parsing and partial application.
 *
 * This is the module that rewrites the user's code, so it is the one place in
 * the app where "lazy" does not apply: a silent mistake here corrupts a commit.
 * Two invariants make it checkable, and `verifyRoundTrip` below enforces them
 * at runtime before anything is written:
 *
 *   selecting every group  → exactly the right-hand content
 *   selecting no group     → exactly the left-hand content
 */

export type DiffLineKind = "context" | "add" | "del";

export interface DiffLine {
  readonly kind: DiffLineKind;
  /** Line text without the leading +/-/space marker and without its newline. */
  readonly text: string;
  /** 1-based line number on the left side; absent for additions. */
  readonly oldLine?: number | undefined;
  /** 1-based line number on the right side; absent for deletions. */
  readonly newLine?: number | undefined;
  /** True when git marked this line as lacking a trailing newline. */
  readonly noNewline: boolean;
}

/**
 * A maximal run of adjacent add/del lines — the unit the user selects.
 *
 * Deliberately finer than jj's own hunks: jj widens a hunk to include context,
 * so two edits eight lines apart can arrive as a single `@@` block, and a UI
 * that offered jj's hunks could not separate them. Grouping by contiguous
 * change runs gives the finest granularity the diff actually supports.
 */
export interface DiffGroup {
  /** Stable within one file diff, so a React key and a selection set can use it. */
  readonly id: string;
  readonly lines: readonly DiffLine[];
  /** First left-side line the group touches; for a pure addition, where it lands. */
  readonly oldStart: number;
  readonly newStart: number;
  readonly additions: number;
  readonly deletions: number;
}

export interface DiffHunk {
  /** The `@@ … @@` header line, verbatim, for display. */
  readonly header: string;
  readonly oldStart: number;
  readonly oldCount: number;
  readonly newStart: number;
  readonly newCount: number;
  readonly lines: readonly DiffLine[];
  readonly groups: readonly DiffGroup[];
}

export interface FileDiff {
  readonly path: string;
  /** Set only for a rename or copy. */
  readonly oldPath?: string | undefined;
  readonly status: FileStatus;
  /** Binary files have no hunks; they can only be taken or left whole. */
  readonly isBinary: boolean;
  readonly hunks: readonly DiffHunk[];
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Parse `jj diff --git` output.
 *
 * Only the fields the UI acts on are extracted; `index`/mode lines are ignored
 * except to classify the change, and unknown headers are skipped rather than
 * treated as content, so a future git-header addition cannot corrupt a hunk.
 */
export function parseGitDiff(text: string): FileDiff[] {
  const files: FileDiff[] = [];
  const lines = text.split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;
    if (!line.startsWith("diff --git ")) {
      index += 1;
      continue;
    }

    // `diff --git a/<old> b/<new>`. Paths with spaces are why this is parsed
    // from the ` b/` separator rather than by splitting on whitespace.
    const spec = line.slice("diff --git ".length);
    const separator = spec.indexOf(" b/");
    let oldPath = separator === -1 ? spec : spec.slice(2, separator);
    let path = separator === -1 ? spec : spec.slice(separator + 3);
    index += 1;

    let status: FileStatus = "modified";
    let isBinary = false;
    const hunks: DiffHunk[] = [];

    // Header block, up to the first hunk or the next file.
    for (; index < lines.length; index += 1) {
      const header = lines[index]!;
      if (header.startsWith("@@") || header.startsWith("diff --git ")) break;
      if (header.startsWith("new file")) status = "added";
      else if (header.startsWith("deleted file")) status = "removed";
      else if (header.startsWith("rename from")) {
        status = "renamed";
        oldPath = header.slice("rename from ".length);
      } else if (header.startsWith("rename to")) {
        status = "renamed";
        path = header.slice("rename to ".length);
      } else if (header.startsWith("copy from")) {
        status = "copied";
        oldPath = header.slice("copy from ".length);
      } else if (header.startsWith("copy to")) {
        status = "copied";
        path = header.slice("copy to ".length);
      } else if (header.startsWith("Binary files") || header.startsWith("GIT binary patch")) {
        isBinary = true;
      }
    }

    // Hunks.
    while (index < lines.length && lines[index]!.startsWith("@@")) {
      const header = lines[index]!;
      const match = HUNK_HEADER.exec(header);
      if (!match) {
        index += 1;
        continue;
      }
      const oldStart = Number(match[1]);
      const oldCount = match[2] === undefined ? 1 : Number(match[2]);
      const newStart = Number(match[3]);
      const newCount = match[4] === undefined ? 1 : Number(match[4]);
      index += 1;

      const hunkLines: DiffLine[] = [];
      let oldLine = oldStart;
      let newLine = newStart;

      for (; index < lines.length; index += 1) {
        const body = lines[index]!;
        if (body.startsWith("@@") || body.startsWith("diff --git ")) break;
        if (body.startsWith("\\")) {
          // `\ No newline at end of file` applies to the line just emitted.
          const last = hunkLines[hunkLines.length - 1];
          if (last) {
            hunkLines[hunkLines.length - 1] = { ...last, noNewline: true };
          }
          continue;
        }
        // A trailing empty string from the final split is not a diff line.
        if (body.length === 0) {
          if (index === lines.length - 1) break;
          // An empty line inside a hunk is a context line whose marker was
          // stripped by a tool that trims trailing whitespace. Treat it as one.
          hunkLines.push({
            kind: "context",
            text: "",
            oldLine: oldLine,
            newLine: newLine,
            noNewline: false,
          });
          oldLine += 1;
          newLine += 1;
          continue;
        }

        const marker = body[0];
        const content = body.slice(1);
        if (marker === "+") {
          hunkLines.push({ kind: "add", text: content, newLine, noNewline: false });
          newLine += 1;
        } else if (marker === "-") {
          hunkLines.push({ kind: "del", text: content, oldLine, noNewline: false });
          oldLine += 1;
        } else {
          hunkLines.push({
            kind: "context",
            text: content,
            oldLine,
            newLine,
            noNewline: false,
          });
          oldLine += 1;
          newLine += 1;
        }
      }

      hunks.push({
        header,
        oldStart,
        oldCount,
        newStart,
        newCount,
        lines: hunkLines,
        groups: groupChanges(path, hunks.length, hunkLines),
      });
    }

    files.push({
      path,
      status,
      isBinary,
      hunks,
      ...(status === "renamed" || status === "copied" ? { oldPath } : {}),
    });
  }

  return files;
}

/** Split a hunk's lines into maximal runs of add/del lines. */
function groupChanges(
  path: string,
  hunkIndex: number,
  lines: readonly DiffLine[],
): DiffGroup[] {
  const groups: DiffGroup[] = [];
  let run: DiffLine[] = [];

  const flush = () => {
    if (run.length === 0) return;
    const first = run[0]!;
    // A run's left anchor is the first deletion's old line, or — for a pure
    // insertion, which has no old line at all — the position it inserts at.
    const firstDel = run.find((line) => line.kind === "del");
    const anchor = firstDel?.oldLine ?? nextOldLine(lines, first);
    groups.push({
      id: `${path}#${hunkIndex}.${groups.length}`,
      lines: run,
      oldStart: anchor,
      newStart: run.find((line) => line.kind === "add")?.newLine ?? first.newLine ?? anchor,
      additions: run.filter((line) => line.kind === "add").length,
      deletions: run.filter((line) => line.kind === "del").length,
    });
    run = [];
  };

  for (const line of lines) {
    if (line.kind === "context") flush();
    else run.push(line);
  }
  flush();
  return groups;
}

/** The left-side line an insertion sits before. */
function nextOldLine(lines: readonly DiffLine[], from: DiffLine): number {
  const start = lines.indexOf(from);
  for (let i = start; i < lines.length; i += 1) {
    const candidate = lines[i]!.oldLine;
    if (candidate !== undefined) return candidate;
  }
  // Insertion at end of file: anchor past the last known old line.
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const candidate = lines[i]!.oldLine;
    if (candidate !== undefined) return candidate + 1;
  }
  return 1;
}

/** Every group in a file diff, in document order. */
export function allGroups(file: FileDiff): DiffGroup[] {
  return file.hunks.flatMap((hunk) => [...hunk.groups]);
}

/**
 * One row of a side-by-side reading: the left file's line beside the right's.
 *
 * Either half can be absent — a row that only deletes has no right line, and
 * one that only adds has no left. A context line fills both, because it *is*
 * both.
 */
export interface DiffRow {
  readonly left?: DiffLine | undefined;
  readonly right?: DiffLine | undefined;
}

/**
 * Fold a hunk's unified lines into side-by-side rows.
 *
 * A replacement arrives from git as every deletion followed by every addition;
 * pairing them by index within that run puts the two versions of the same line
 * on one row, which is the whole point of the two columns. The longer side
 * spills onto rows whose other half is empty, so nothing is dropped and no
 * line is invented — this only rearranges what `parseGitDiff` already read.
 */
export function pairRows(lines: readonly DiffLine[]): DiffRow[] {
  const rows: DiffRow[] = [];
  let dels: DiffLine[] = [];
  let adds: DiffLine[] = [];

  const flush = () => {
    const height = Math.max(dels.length, adds.length);
    for (let i = 0; i < height; i += 1) rows.push({ left: dels[i], right: adds[i] });
    dels = [];
    adds = [];
  };

  for (const line of lines) {
    if (line.kind === "del") dels.push(line);
    else if (line.kind === "add") adds.push(line);
    else {
      flush();
      rows.push({ left: line, right: line });
    }
  }
  flush();
  return rows;
}

/**
 * Rebuild a file's content with only the selected groups applied.
 *
 * Walks the left content and swaps each hunk's span for a reconstruction:
 * a selected group contributes its additions, an unselected one keeps its
 * deletions. Context lines are emitted either way, which is what makes a
 * partial selection produce a coherent file rather than a merge of two.
 */
export function applySelectedGroups(
  leftContent: string,
  file: FileDiff,
  selected: ReadonlySet<string>,
): string {
  const left = splitLines(leftContent);
  const leftEndsWithNewline = leftContent === "" || leftContent.endsWith("\n");

  /**
   * Emitted lines, each carrying whether *it* ends the file without a newline.
   *
   * Tracked per line rather than decided at the end: git prints
   * `\ No newline at end of file` after both sides of a final-line change, so
   * the marker on the last diff line says nothing about which side survives
   * this particular selection. Only the line actually left in the output can
   * answer that, and getting it wrong adds or drops a byte at end of file —
   * a phantom one-line diff that never goes away.
   */
  const out: { text: string; noNewline: boolean }[] = [];
  let cursor = 0; // 0-based index into `left`

  const pushLeft = (index: number) => {
    out.push({
      text: left[index]!,
      noNewline: index === left.length - 1 && !leftEndsWithNewline,
    });
  };

  for (const hunk of file.hunks) {
    // Copy untouched left lines up to this hunk.
    const hunkStart = hunk.oldCount === 0 ? hunk.oldStart : hunk.oldStart - 1;
    for (; cursor < hunkStart && cursor < left.length; cursor += 1) pushLeft(cursor);

    for (const line of hunk.lines) {
      if (line.kind === "context") {
        out.push({ text: line.text, noNewline: line.noNewline });
        continue;
      }
      const group = hunk.groups.find((candidate) => candidate.lines.includes(line));
      const isSelected = group !== undefined && selected.has(group.id);
      if (line.kind === "add" && isSelected) {
        out.push({ text: line.text, noNewline: line.noNewline });
      }
      if (line.kind === "del" && !isSelected) {
        out.push({ text: line.text, noNewline: line.noNewline });
      }
    }

    cursor = hunkStart + hunk.oldCount;
  }

  for (; cursor < left.length; cursor += 1) pushLeft(cursor);

  if (out.length === 0) return "";
  const body = out.map((line) => line.text).join("\n");
  return out[out.length - 1]!.noNewline ? body : `${body}\n`;
}

/** Split content into lines, dropping the empty string a trailing newline leaves. */
function splitLines(content: string): string[] {
  if (content === "") return [];
  const lines = content.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Check the two invariants that make partial application trustworthy.
 *
 * Called before a split or squash actually runs. If either fails we refuse the
 * operation rather than write a tree we cannot account for — a wrong tree here
 * is silent data loss, and jj would faithfully commit it.
 */
export function verifyRoundTrip(
  leftContent: string,
  rightContent: string,
  file: FileDiff,
): { ok: true } | { ok: false; reason: string } {
  const everything = new Set(allGroups(file).map((group) => group.id));
  const all = applySelectedGroups(leftContent, file, everything);
  if (all !== rightContent) {
    return {
      ok: false,
      reason: `selecting every group in ${file.path} did not reproduce the new content`,
    };
  }
  const none = applySelectedGroups(leftContent, file, new Set());
  if (none !== leftContent) {
    return {
      ok: false,
      reason: `selecting no group in ${file.path} did not reproduce the old content`,
    };
  }
  return { ok: true };
}

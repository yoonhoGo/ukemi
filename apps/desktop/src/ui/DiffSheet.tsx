import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { AnnotationLine, DiffLine, FileDiff, Revision, WordSpan } from "@ukemi/domain";
import { fileTree, pairRows, pairedWords, parseGitDiff } from "@ukemi/domain";
import { messageFor, useAnnotate, useDiffRange, useFileDiff, useInterdiff } from "../repo.tsx";
import { t } from "../i18n/i18n.ts";
import { authorColor, authorInitials, colorForChange, nodeColor } from "./change-color.ts";
import { DirectoryRow, FROM_PARENT, INDENT, STATUS_MARK, treeRows } from "./Inspector.tsx";
import { useModal } from "./modal.ts";
import { relativeTime } from "./time.ts";

/**
 * The diff reader.
 *
 * The inspector is 372px wide, which is narrower than the code it was showing:
 * a unified diff wrapped on nearly every line, so reading one meant
 * reconstructing it. The diff is jj's own diff — it just needed a window wide
 * enough to be read in.
 *
 * Two readings of that one diff are offered. Unified is jj's, verbatim, and
 * stays the default: the two gutters are the old and new line numbers, not two
 * versions of the file. Side-by-side rearranges the same parsed lines into two
 * columns (`pairRows` in the domain) for the case unified is bad at — a
 * rewritten line, where the old and new text have to be compared word by word
 * rather than eight rows apart. Neither fetches anything the other did not.
 *
 * It is a sheet rather than a second OS window on purpose: a `WebviewWindow`
 * would mean a second React root, a second query client (or cache sync between
 * them), its own menu and its own window-state persistence — for a pane that
 * shows a string this window has already read.
 */
export function DiffSheet({
  revision,
  path,
  against,
  onClose,
}: {
  revision: Revision;
  path: string;
  /**
   * The other side of a comparison, in the two shapes that ask for one. Absent
   * is the ordinary reading: what this revision does to its parent.
   *
   * A bare revset compares this revision's *patch* against that one's — the
   * pushed side of a bookmark, or a ⌘-marked row. jj counts the description as
   * part of an interdiff and emits it as a synthetic `JJ-COMMIT-DESCRIPTION`
   * file, so the file list can hold a row that is not a file. Left as jj sends
   * it: "the message changed too" is part of the answer to "what changed since
   * I pushed".
   *
   * Tagged with `FROM_PARENT`, it is a parent of a merge and the question is
   * the opposite one — what this revision's tree has that the parent's did not.
   * See the merge step in `Inspector.tsx` for why a merge needs it.
   */
  against?: string | undefined;
  onClose(): void;
}) {
  /*
   * How much unchanged code jj prints around each change. Undefined means
   * jj's own default of three, which is what a diff is for; the wider reads are
   * how the reader asks for the lines the diff hid. jj is asked again rather
   * than the gaps being reconstructed here — it already has the file, and
   * splicing a blob into a parsed diff on this side is the kind of code that
   * silently disagrees with what the commit actually says.
   */
  const [context, setContext] = useState<number | undefined>(undefined);
  const [split, setSplit] = useState(false);
  /*
   * Blame. The one question the diff cannot answer is who touched a line this
   * change did *not* — and jj already answers it as `jj file annotate`, so this
   * is a template read like the others, not a blame walk of our own. Read only
   * while the toggle is on: the sheet's ordinary reading must not pay for it.
   */
  const [blame, setBlame] = useState(false);
  /*
   * One read for the whole revision instead of one per file. The sheet's whole
   * point is walking the change file by file, so the second file must not cost
   * a jj call — and this is `jj diff -r <rev> --git`, the same read the hunk
   * sheet already makes, keyed on the operation id like every other read.
   *
   * It also settles the line numbers. The inspector's inline diff numbered its
   * gutter with the index of the rendered array, which is the file's line
   * number only for a diff that starts at line 1 and has one hunk. The domain's
   * `parseGitDiff` counts from the `@@` headers and carries both sides per
   * line, so the wide view — where a wrong number is legible — shows the true
   * ones, and the parser is the one already trusted to rewrite commits.
   */
  /*
   * Three reads, two of them always off. Hooks cannot be called conditionally,
   * and each is `enabled`-gated on an argument being present, so the disabled
   * ones cost nothing and no branch needs its own component.
   *
   * The two comparisons take the same pair of revisions and answer different
   * questions — see `interdiff` and `diffRange` in `port.ts` — so which one is
   * meant travels in the string rather than being inferred from it. A parent is
   * a plausible mark, and reading the wrong command out of that would show a
   * confident wrong answer.
   */
  const fromParent = against?.startsWith(FROM_PARENT)
    ? against.slice(FROM_PARENT.length)
    : undefined;
  const marked = fromParent === undefined ? against : undefined;
  const plain = useFileDiff(against === undefined ? revision.changeId : undefined, undefined, context);
  const compared = useInterdiff(marked, marked === undefined ? undefined : revision.changeId, context);
  const brought = useDiffRange(
    fromParent,
    fromParent === undefined ? undefined : revision.changeId,
    context,
  );
  const diff = fromParent !== undefined ? brought : marked !== undefined ? compared : plain;
  const files = useMemo(() => parseGitDiff(diff.data ?? ""), [diff.data]);
  const [current, setCurrent] = useState(path);
  /*
   * The same tree the inspector's list draws, from the same `fileTree` — a
   * `FileDiff` is a `FileChange` with hunks on it, so the parsed diff goes
   * straight in.
   *
   * ↑↓ walks `order` rather than `files`: the keys move between what is on
   * screen, so a file inside a folded directory is skipped, and the order is
   * the tree's, not the order jj happened to print the diff in.
   */
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const rows = useMemo(() => treeRows(fileTree(files), folded), [files, folded]);
  const order = useMemo(
    () => rows.flatMap(({ node }) => (node.kind === "file" ? [node.path] : [])),
    [rows],
  );
  /*
   * Find, in the file on screen. A long file's diff is the one thing this sheet
   * shows that cannot be skimmed, and the reader already has the text — so this
   * is `indexOf` over the parsed lines, not a second jj read.
   *
   * ponytail: the file on screen only. Searching the whole change would mean
   * counting matches per file and a result list beside the file list; if that
   * is wanted, `findHits` already takes one `FileDiff` and would be mapped over
   * `files`.
   */
  const [finding, setFinding] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const find = useRef<HTMLInputElement>(null);
  // Done is the only control besides the file list, so it is where focus lands
  // and, with the list, the whole Tab ring.
  const done = useRef<HTMLButtonElement>(null);
  const panel = useModal(done);

  // The clicked path came from `diffSummary`, which is a different jj read, and
  // the graph selection can still change underneath an open sheet. Falling back
  // to the first file is what keeps the pane from going blank in either case.
  const file = files.find((candidate) => candidate.path === current) ?? files[0];
  // A removed file has no content at this revision, so there is nothing to annotate.
  const canBlame = file !== undefined && file.status !== "removed";
  const annotation = useAnnotate(
    blame && canBlame ? revision.changeId : undefined,
    blame && canBlame ? file.path : undefined,
  );

  /*
   * Nothing is highlighted while the bar is down or blame is up: in both cases
   * the query is not what is being read. Lowercased once here so the search and
   * the width the highlight paints agree on the same needle.
   */
  const needle = finding && !blame ? query.toLowerCase() : "";
  const hits = useMemo(() => findHits(file, needle), [file, needle]);
  // `cursor` is left to run past the end so stepping is one modulo either way;
  // this is the position it actually means.
  const spot = hits.length === 0 ? -1 : cursor % hits.length;
  const marks = useMemo(() => {
    const byLine = new Map<DiffLine, Mark[]>();
    hits.forEach((hit, index) => {
      const mark = { start: hit.start, current: index === spot };
      const list = byLine.get(hit.line);
      if (list) list.push(mark);
      else byLine.set(hit.line, [mark]);
    });
    return byLine;
  }, [hits, spot]);

  // Wraps both ways, so ⏎ past the last match comes back to the first.
  const jump = (by: number) => {
    if (hits.length === 0) return;
    setCursor((((spot + by) % hits.length) + hits.length) % hits.length);
  };

  // A different file counts from its own first match: a position that meant
  // something in the file before this one would point at nothing here.
  useEffect(() => setCursor(0), [file?.path]);

  // The input does not exist until the bar renders, so the first ⌘F focuses it
  // from here rather than from the key handler.
  useEffect(() => {
    if (finding) find.current?.select();
  }, [finding]);

  // Both readings put the current match in the same `data-find-current`, so one
  // query finds it whichever of them is on screen.
  useEffect(() => {
    panel.current
      ?.querySelector("[data-find-current]")
      ?.scrollIntoView({ block: "center", inline: "nearest" });
  }, [panel, marks, split]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      /*
       * ⌘F belongs to the toolbar's graph search, which is still listening
       * behind the scrim. While this sheet is up the diff is the thing being
       * read, so the sheet takes the key in capture and does not let it
       * through — and closing the sheet unbinds this, handing ⌘F back.
       */
      if (event.key.toLowerCase() === "f" && event.metaKey && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        // Blame renders jj's annotation rather than the diff lines this
        // searches, so ⌘F leaves it instead of opening a bar over a body that
        // would ignore every match.
        setBlame(false);
        setFinding(true);
        find.current?.select();
        return;
      }
      /*
       * Escape in two steps. The window's key map owns the second one — it
       * closes the sheets in a priority order — so the first is this handler
       * swallowing the key while the bar is up, which is also why it has to be
       * in capture: the map listens on the window in bubble.
       */
      if (event.key === "Escape" && finding) {
        event.stopPropagation();
        setFinding(false);
        panel.current?.focus();
        return;
      }
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      // ↑/↓ inside the find field are the caret's, not the file list's.
      if (event.target === find.current) return;
      event.preventDefault();
      /*
       * Only the keys this sheet actually uses are stopped. The hunk sheet
       * stops every key it does not use, which is what left its description
       * field unable to take a space — the find field above would lose its
       * letters the same way, and the blanket handler would also swallow ⌘/
       * and ⌘G, which is exactly what reading an unfamiliar diff wants.
       */
      event.stopPropagation();
      // A current file that is not in `order` — its directory was folded shut
      // under it — indexes at -1, and either key then lands on the first
      // visible file rather than nowhere.
      const index = order.indexOf(file?.path ?? "");
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = order[Math.min(order.length - 1, Math.max(0, index + step))];
      if (next !== undefined) setCurrent(next);
    };
    // Capture, so the window's own ↑/↓ does not also walk the graph selection
    // out from under the sheet.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [order, file?.path, finding, panel]);

  const tally = file ? countLines(file) : undefined;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.24)",
        zIndex: 90,
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        // The visible title is the file path, which is the subject but not the
        // kind of thing this is.
        aria-label={t("File diff")}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        style={{
          display: "flex",
          flexDirection: "column",
          // Wider than the hunk sheet's 920: that one spends its width on a
          // list beside a hunk, this one is here to hold long lines of code.
          width: 1100,
          height: 720,
          maxWidth: "94vw",
          maxHeight: "92vh",
          borderRadius: 12,
          overflow: "hidden",
          background: "var(--u-bg-sidebar)",
          boxShadow: "0 30px 70px rgba(0,0,0,0.28), 0 0 0 1px var(--u-line)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 20px 12px",
          }}
        >
          {/* A long path is cut at the front, as the file rows are: the tail —
              the file name — is the part being read. */}
          <span
            className="mono selectable"
            style={{
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              direction: "rtl",
              textAlign: "left",
              fontSize: 14,
              fontWeight: 600,
            }}
            title={file?.path}
          >
            {file?.path ?? ""}
          </span>
          {/* `FileChange` declares `insertions`/`deletions`, but nothing fills
              them: `jj diff --summary` prints no counts, so the adapter leaves
              them absent. The parsed lines are the only place the numbers
              exist, and they are already in hand. */}
          {marked !== undefined && (
            <span className="pill" style={{ flexShrink: 0 }}>
              {t("since {ref}", { ref: marked })}
            </span>
          )}
          {/* Deliberately not "since": nothing changed *after* that parent, the
              other side of the merge arrived beside it. The parent is shortened
              the way every other change ID in this window is; the full one is
              what went to jj. */}
          {fromParent !== undefined && (
            <span className="pill" style={{ flexShrink: 0 }}>
              {t("brought in over {ref}", { ref: fromParent.slice(0, 8) })}
            </span>
          )}
          {tally && (
            <span className="mono" style={{ flexShrink: 0, fontSize: 12 }}>
              <span style={{ color: "var(--u-added)" }}>+{tally.additions}</span>{" "}
              <span style={{ color: "var(--u-removed)" }}>−{tally.deletions}</span>
            </span>
          )}
          <span style={{ flexGrow: 1 }} />
          <button
            type="button"
            className="tb-btn"
            aria-pressed={split}
            disabled={blame}
            title={
              split
                ? t("Show jj's own one-column diff")
                : t("Show the old and new versions in two columns")
            }
            onClick={() => setSplit(!split)}
          >
            {split ? t("Unified") : t("Side by side")}
          </button>
          <button
            type="button"
            className="tb-btn"
            aria-pressed={blame}
            disabled={!canBlame}
            title={
              canBlame
                ? t("Show which change last touched each line (jj file annotate)")
                : t("A removed file has no lines to annotate")
            }
            onClick={() => setBlame(!blame)}
          >
            {t("Blame")}
          </button>
          {/* One button through three widths rather than a stepper: the states
              are an order, not a value to dial in, and the label can say which
              way the next press goes. */}
          <button
            type="button"
            className="tb-btn"
            disabled={diff.isPending}
            title={offer(context).title()}
            onClick={() => setContext(offer(context).context)}
          >
            {offer(context).label()}
          </button>
          <span className="mono selectable" style={{ flexShrink: 0, fontSize: 12 }}>
            <span style={{ color: nodeColor(revision) }}>
              {revision.changeId.slice(0, 2)}
            </span>
            <span className="sec">{revision.changeId.slice(2, 8)}</span>
          </span>
          <button type="button" ref={done} className="tb-btn" onClick={onClose}>
            {t("Done")} <span className="key">Esc</span>
          </button>
        </div>

        {/* Its own strip under the header rather than a control in it: the
            header is about the file, and this is about the reading of it. */}
        {finding && !blame && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              margin: "0 20px 10px",
              padding: "0 10px",
              height: 28,
              borderRadius: 7,
              background: "var(--u-bg-raised)",
              border: "1px solid var(--u-line-strong)",
            }}
          >
            <input
              ref={find}
              className="selectable"
              value={query}
              spellCheck={false}
              placeholder={t("Find in this file")}
              aria-label={t("Find in this file")}
              onChange={(event) => {
                setQuery(event.target.value);
                // A new query counts from the top; the old position pointed at
                // a match that is not there any more.
                setCursor(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") jump(event.shiftKey ? -1 : 1);
                // The window's map is live behind this field, as it is behind
                // every other one in this window.
                event.stopPropagation();
              }}
              style={{
                flexGrow: 1,
                minWidth: 0,
                background: "transparent",
                outline: "none",
                fontSize: 12,
              }}
            />
            <span className="sec" style={{ flexShrink: 0, fontSize: 11.5 }}>
              {query === ""
                ? ""
                : hits.length === 0
                  ? t("No matches")
                  : t("{index} of {total}", { index: spot + 1, total: hits.length })}
            </span>
            <span className="key">⏎</span>
            <span className="key">⇧⏎</span>
            <span className="key">Esc</span>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "250px minmax(0,1fr)",
            gap: 12,
            padding: "0 20px",
            flexGrow: 1,
            minHeight: 0,
          }}
        >
          <div
            className="u-scroll"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              padding: 10,
              borderRadius: 9,
              background: "var(--u-bg-raised)",
              border: "1px solid var(--u-line)",
            }}
          >
            <div className="side-head" style={{ padding: "2px 4px 6px" }}>
              {t("FILES CHANGED")} · <span className="key">↑↓</span>
            </div>
            {diff.isPending && <div className="sec">{t("Loading diff…")}</div>}
            {!diff.isPending && files.length === 0 && (
              <div className="sec">{t("No file changes.")}</div>
            )}
            {rows.map(({ node, depth }) => {
              if (node.kind === "directory") {
                return (
                  <DirectoryRow
                    key={`directory:${node.path}`}
                    name={node.name}
                    path={node.path}
                    fileCount={node.fileCount}
                    depth={depth}
                    folded={folded.has(node.path)}
                    onToggle={() =>
                      setFolded((previous) => {
                        const next = new Set(previous);
                        if (!next.delete(node.path)) next.add(node.path);
                        return next;
                      })
                    }
                  />
                );
              }
              const status = STATUS_MARK[node.change.status];
              return (
                <button
                  type="button"
                  className="file"
                  // A file and a directory beside each other can share a path,
                  // so the kind is part of the key — see `fileTree`.
                  key={`file:${node.path}`}
                  aria-selected={node.path === file?.path}
                  onClick={() => setCurrent(node.path)}
                  title={node.path}
                  style={{ paddingLeft: 6 + depth * INDENT }}
                >
                  <span
                    className="mono"
                    style={{ color: status.color, fontWeight: 700, width: 10 }}
                  >
                    {status.mark}
                  </span>
                  {/* The name alone; its directories are rows above it now. */}
                  <span
                    style={{
                      flexGrow: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {node.name}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className="u-scroll"
            style={{
              borderRadius: 9,
              background: "var(--u-bg-raised)",
              border: "1px solid var(--u-line)",
            }}
          >
            {file && blame && canBlame ? (
              <BlameBody
                lines={annotation.data}
                pending={annotation.isPending}
                error={annotation.error}
              />
            ) : (
              file && (
                <Body file={file} split={split} marks={marks} width={needle.length} />
              )
            )}
          </div>
        </div>

        {/* Which jj command produced what is on screen, the same way the
            window's footer says it for writes. It is also the honest label for
            the shape of the thing: `--git` output is a unified diff. */}
        <div className="sec" style={{ padding: "12px 20px 16px", fontSize: 12 }}>
          <span className="mono">
            {blame && canBlame
              ? `jj file annotate -r ${revision.changeId.slice(0, 8)} ${file.path}`
              : `${
                  fromParent !== undefined
                    ? `jj diff --from ${fromParent.slice(0, 8)} --to ${revision.changeId.slice(0, 8)}`
                    : marked !== undefined
                      ? `jj interdiff --from ${marked} --to ${revision.changeId.slice(0, 8)}`
                      : `jj diff -r ${revision.changeId.slice(0, 8)}`
                } --git${context === undefined ? "" : ` --context ${context}`}`}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Word spans for every rewritten line in the file, in one map.
 *
 * Built per file rather than per hunk so both readings share one computation
 * and one identity: `pairedWords` keys on the `DiffLine` object itself, and
 * unified and side-by-side render the very same objects.
 */
function useWordSpans(file: FileDiff | undefined): Map<DiffLine, readonly WordSpan[]> {
  return useMemo(() => {
    const spans = new Map<DiffLine, readonly WordSpan[]>();
    for (const hunk of file?.hunks ?? []) {
      for (const [line, words] of pairedWords(hunk.lines)) spans.set(line, words);
    }
    return spans;
  }, [file]);
}

/** One match inside one line: where it starts, and whether it is the one the
 *  reader is standing on. */
type Mark = { start: number; current: boolean };

/** Every match of an already-lowercased needle in a file's diff lines, in the
 *  order they are rendered. An empty needle matches nothing rather than
 *  everything. */
function findHits(
  file: FileDiff | undefined,
  needle: string,
): readonly { line: DiffLine; start: number }[] {
  if (!file || needle === "") return [];
  const hits: { line: DiffLine; start: number }[] = [];
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      const haystack = line.text.toLowerCase();
      for (
        let at = haystack.indexOf(needle);
        at !== -1;
        at = haystack.indexOf(needle, at + needle.length)
      ) {
        hits.push({ line, start: at });
      }
    }
  }
  return hits;
}

/**
 * The line's word spans, cut again wherever a match starts or ends.
 *
 * ponytail: one array entry per character of the line. A diff line is short,
 * and a character map turns two overlapping sets of ranges into a single walk
 * — the interval merge it replaces is the part that would have been wrong. A
 * file whose lines are megabytes would want the merge.
 */
function cut(
  spans: readonly WordSpan[],
  marks: readonly Mark[],
  width: number,
): { text: string; changed: boolean; hit: 0 | 1 | 2 }[] {
  const length = spans.reduce((sum, span) => sum + span.text.length, 0);
  const hit = new Array<0 | 1 | 2>(length).fill(0);
  for (const mark of marks) {
    for (let at = mark.start; at < Math.min(mark.start + width, length); at += 1) {
      hit[at] = mark.current ? 2 : 1;
    }
  }
  const pieces: { text: string; changed: boolean; hit: 0 | 1 | 2 }[] = [];
  let base = 0;
  for (const span of spans) {
    let start = 0;
    for (let at = 1; at <= span.text.length; at += 1) {
      if (at < span.text.length && hit[base + at] === hit[base + start]) continue;
      pieces.push({
        text: span.text.slice(start, at),
        changed: span.changed,
        hit: hit[base + start] ?? 0,
      });
      start = at;
    }
    base += span.text.length;
  }
  return pieces;
}

/*
 * A search hit sits *under* the word-level `<mark>`, which the theme paints as
 * a translucent tint of the row's own colour — so a hit inside a rewritten word
 * shows both rather than one covering the other. The current hit is the solid
 * accent for the same reason the file list uses it: it is where you are.
 */
const FIND_HIT: React.CSSProperties = {
  background: "var(--u-accent-soft)",
  borderRadius: 2,
};
const FIND_CURRENT: React.CSSProperties = {
  background: "var(--u-accent)",
  color: "var(--u-accent-ink)",
  borderRadius: 2,
};

/**
 * One diff line's text, with the part that actually changed marked and the
 * search hits in it picked out.
 *
 * The +/− marker is part of the text so the column stays aligned whether or
 * not a line got spans. With neither spans nor hits this renders exactly what
 * it always did: a line with no partner, or one whose partner shares nothing
 * with it, is a whole-line claim and the row's tint is already making it.
 */
function LineText({
  line,
  spans,
  marks,
  width,
}: {
  line: DiffLine;
  spans: readonly WordSpan[] | undefined;
  marks: readonly Mark[] | undefined;
  width: number;
}) {
  const marker = line.kind === "add" ? "+" : line.kind === "del" ? "-" : " ";
  if (!spans && !marks) {
    return (
      <>
        {marker}
        {line.text}
      </>
    );
  }
  const pieces = cut(spans ?? [{ text: line.text, changed: false }], marks ?? [], width);
  return (
    <>
      {marker}
      {pieces.map((piece, index) => {
        const text = piece.changed ? <mark>{piece.text}</mark> : piece.text;
        if (piece.hit === 0) return <Fragment key={index}>{text}</Fragment>;
        return (
          <span
            key={index}
            {...(piece.hit === 2 ? { "data-find-current": "" } : {})}
            style={piece.hit === 2 ? FIND_CURRENT : FIND_HIT}
          >
            {text}
          </span>
        );
      })}
    </>
  );
}

/**
 * One file's diff, as wide as its widest line.
 *
 * `.diff-line` wraps (`pre-wrap`, `break-all`), which is right in a 372px
 * panel and wrong here — a wrapped line hides which column a change is in.
 * Rows opt back into `pre` and the block sizes to `max-content`, so the
 * container above scrolls sideways for the long lines and the row backgrounds
 * still span the full width.
 */
function Body({
  file,
  split,
  marks,
  width,
}: {
  file: FileDiff;
  split: boolean;
  marks: Map<DiffLine, Mark[]>;
  width: number;
}) {
  const words = useWordSpans(file);
  if (file.isBinary) {
    return (
      <div className="sec" style={{ padding: 12 }}>
        {t("Binary file — no text diff to show.")}
      </div>
    );
  }
  if (file.hunks.length === 0) {
    // A file jj lists but has no hunks for: a mode change, or an empty file
    // added. Saying so beats an empty pane that looks like a failed read.
    return (
      <div className="sec" style={{ padding: 12 }}>
        {t("No lines changed in this file.")}
      </div>
    );
  }

  if (split) return <SplitBody file={file} words={words} marks={marks} width={width} />;

  return (
    <div
      className="mono selectable"
      style={{ width: "max-content", minWidth: "100%", padding: "6px 0" }}
    >
      {file.hunks.map((hunk, hunkIndex) => (
        <div key={hunkIndex}>
          <div className="diff-line" data-kind="hunk" style={ROW}>
            <span className="ln" />
            <span className="ln" />
            <span>{hunk.header}</span>
          </div>
          {hunk.lines.map((line, lineIndex) => (
            <div
              key={lineIndex}
              className="diff-line"
              {...(line.kind === "context" ? {} : { "data-kind": line.kind })}
              style={ROW}
            >
              <span className="ln">{line.oldLine ?? ""}</span>
              <span className="ln">{line.newLine ?? ""}</span>
              <span>
                <LineText
                  line={line}
                  spans={words.get(line)}
                  marks={marks.get(line)}
                  width={width}
                />
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * One file at one revision, each line labelled with the change that wrote it.
 *
 * The change column is drawn once per run (`firstInHunk`), the way `git blame`
 * and Fork do; the run's left border in the change's colour is what holds the
 * rest of the run to that label.
 */
function BlameBody({
  lines,
  pending,
  error,
}: {
  lines: readonly AnnotationLine[] | undefined;
  pending: boolean;
  error: unknown;
}) {
  if (error) {
    return (
      <div role="alert" className="mono selectable" style={{ padding: 12, fontSize: 12, color: "var(--u-conflict)", whiteSpace: "pre-wrap" }}>
        {messageFor(error)}
      </div>
    );
  }
  if (pending || !lines) {
    return (
      <div className="sec" style={{ padding: 12 }}>
        {t("Loading blame…")}
      </div>
    );
  }
  return (
    <div
      className="mono selectable"
      style={{ width: "max-content", minWidth: "100%", padding: "6px 0", fontSize: 12 }}
    >
      {lines.map((line) => {
        const color = colorForChange(line.changeId);
        return (
          <div
            key={line.lineNumber}
            style={{
              display: "grid",
              gridTemplateColumns: "44px 260px max-content",
              alignItems: "center",
              minHeight: 20,
              borderLeft: `3px solid ${color}`,
              whiteSpace: "pre",
            }}
          >
            <span className="ln sec" style={{ textAlign: "right", paddingRight: 8 }}>
              {line.lineNumber}
            </span>
            {line.firstInHunk ? (
              <span
                style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, paddingRight: 8 }}
                title={`${line.subject}\n${line.author.name} <${line.author.email}>`}
              >
                <span style={{ color, fontWeight: 700 }}>{line.changeId.slice(0, 2)}</span>
                <span className="ter">{line.changeId.slice(2, 8)}</span>
                <span
                  className="avatar"
                  style={{
                    background: authorColor(line.author.email),
                    display: "inline-flex",
                    width: 16,
                    height: 16,
                    fontSize: 8,
                    flexShrink: 0,
                  }}
                >
                  {authorInitials(line.author.name, line.author.email)}
                </span>
                <span className="sec" style={{ flexShrink: 0 }}>
                  {relativeTime(line.author.timestamp)}
                </span>
                <span
                  className="sec"
                  style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {line.subject}
                </span>
              </span>
            ) : (
              <span />
            )}
            <span>{line.content}</span>
          </div>
        );
      })}
    </div>
  );
}

const ROW: React.CSSProperties = {
  gridTemplateColumns: "44px 44px max-content",
  whiteSpace: "pre",
  wordBreak: "normal",
};

/**
 * The same file, in two columns.
 *
 * One grid for the whole file, not one per row: both halves of a row have to
 * share a row box, or a line that wraps on one side slides the other side's
 * rows out of step. Each half is a `.diff-line` — the contract class a theme
 * already styles per `data-kind` — so the colours and the row floor come from
 * the theme rather than from inline colour here.
 *
 * The two columns split the pane evenly and long lines *wrap*, which is the
 * opposite of the unified reading and deliberate. Sizing the columns to their
 * content instead pushed the new side off the right edge of a 1100px sheet for
 * any file with one long line — a side-by-side view whose second side has to be
 * scrolled to is not one. Unified is still there for a true measure.
 */
function SplitBody({
  file,
  words,
  marks,
  width,
}: {
  file: FileDiff;
  words: Map<DiffLine, readonly WordSpan[]>;
  marks: Map<DiffLine, Mark[]>;
  width: number;
}) {
  return (
    <div
      className="mono selectable"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
        padding: "6px 0",
      }}
    >
      {file.hunks.map((hunk, hunkIndex) => (
        <Fragment key={hunkIndex}>
          <div
            className="diff-line"
            data-kind="hunk"
            style={{ ...SIDE, gridColumn: "1 / -1" }}
          >
            <span className="ln" />
            <span>{hunk.header}</span>
          </div>
          {pairRows(hunk.lines).map((row, rowIndex) => (
            <Fragment key={rowIndex}>
              <Half line={row.left} side="old" words={words} marks={marks} width={width} />
              <Half line={row.right} side="new" words={words} marks={marks} width={width} />
            </Fragment>
          ))}
        </Fragment>
      ))}
    </div>
  );
}

/**
 * One side of one row. An absent half is still rendered: the row has to keep
 * its height and the column its divider, or the two sides drift apart.
 *
 * The +/− marker is kept even though the column already says which side this
 * is, because colour is the other thing saying it and colour alone is not a
 * label.
 */
function Half({
  line,
  side,
  words,
  marks,
  width,
}: {
  line: DiffLine | undefined;
  side: "old" | "new";
  words: Map<DiffLine, readonly WordSpan[]>;
  marks: Map<DiffLine, Mark[]>;
  width: number;
}) {
  const kind = line === undefined || line.kind === "context" ? undefined : line.kind;
  return (
    <div
      className="diff-line"
      {...(kind === undefined ? {} : { "data-kind": kind })}
      style={{
        ...SIDE,
        ...(side === "new" ? { borderLeft: "1px solid var(--u-line)" } : {}),
      }}
    >
      <span className="ln">{(side === "old" ? line?.oldLine : line?.newLine) ?? ""}</span>
      <span>
        {line === undefined ? (
          ""
        ) : (
          <LineText
            line={line}
            spans={words.get(line)}
            marks={marks.get(line)}
            width={width}
          />
        )}
      </span>
    </div>
  );
}

/* Only the gutter width, to match the unified rows. Wrapping is `.diff-line`'s
   own default and is wanted here. */
const SIDE: React.CSSProperties = { gridTemplateColumns: "44px minmax(0, 1fr)" };

/**
 * The widths the context button walks, in order. Each entry is what the *next*
 * press does, which is why its label reads as an instruction.
 *
 * Three lines is jj's default and is left as an absent flag, so the common read
 * keeps the argument list — and the cache entry — it always had. "Whole file"
 * is a number rather than a flag because jj has no such flag; a count larger
 * than any file is the same thing and needs no special case anywhere else.
 * Labels are functions so a locale switch re-reads them.
 */
const STEP = [
  {
    context: 25,
    label: () => t("Expand hidden lines"),
    title: () => t("Read the diff again with 25 lines of context"),
  },
  {
    context: 100_000,
    label: () => t("Show whole file"),
    title: () => t("Read the diff again with the whole file as context"),
  },
  {
    context: undefined,
    label: () => t("Collapse context"),
    title: () => t("Back to jj's three lines of context"),
  },
] as const;

/**
 * What the button offers at the current width — the step after this one, so the
 * last width wraps back to jj's default.
 */
function offer(context: number | undefined): (typeof STEP)[number] {
  const index = STEP.findIndex((step) => step.context === context);
  return STEP[(index + 1) % STEP.length] ?? STEP[0];
}

function countLines(file: FileDiff): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.kind === "add") additions += 1;
      else if (line.kind === "del") deletions += 1;
    }
  }
  return { additions, deletions };
}

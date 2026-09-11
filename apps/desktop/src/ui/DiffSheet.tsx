import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { AnnotationLine, DiffLine, FileDiff, Revision, WordSpan } from "@ukemi/domain";
import { pairRows, pairedWords, parseGitDiff } from "@ukemi/domain";
import { messageFor, useAnnotate, useFileDiff } from "../repo.tsx";
import { t } from "../i18n/i18n.ts";
import { authorColor, authorInitials, colorForChange, nodeColor } from "./change-color.ts";
import { STATUS_MARK } from "./Inspector.tsx";
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
  onClose,
}: {
  revision: Revision;
  path: string;
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
  const diff = useFileDiff(revision.changeId, undefined, context);
  const files = useMemo(() => parseGitDiff(diff.data ?? ""), [diff.data]);
  const [current, setCurrent] = useState(path);
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      /*
       * Only the two keys this sheet actually uses are stopped. The hunk sheet
       * stops every key it does not use, which is what left its description
       * field unable to take a space — there is no text input here for that to
       * break, but the same handler would also swallow ⌘/ and ⌘G, and reading
       * an unfamiliar diff is exactly when looking a command up is wanted.
       * Escape is not here at all: the window's key map owns it and closes the
       * sheets in a priority order.
       */
      event.stopPropagation();
      const index = files.findIndex((candidate) => candidate.path === file?.path);
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = files[Math.min(files.length - 1, Math.max(0, index + step))];
      if (next) setCurrent(next.path);
    };
    // Capture, so the window's own ↑/↓ does not also walk the graph selection
    // out from under the sheet.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [files, file?.path]);

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
            {files.map((candidate) => {
              const status = STATUS_MARK[candidate.status];
              return (
                <button
                  type="button"
                  className="file"
                  key={candidate.path}
                  aria-selected={candidate.path === file?.path}
                  onClick={() => setCurrent(candidate.path)}
                  title={candidate.path}
                >
                  <span
                    className="mono"
                    style={{ color: status.color, fontWeight: 700, width: 10 }}
                  >
                    {status.mark}
                  </span>
                  <span
                    style={{
                      flexGrow: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      direction: "rtl",
                      textAlign: "left",
                    }}
                  >
                    {candidate.path}
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
              file && <Body file={file} split={split} />
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
              : `jj diff -r ${revision.changeId.slice(0, 8)} --git${
                  context === undefined ? "" : ` --context ${context}`
                }`}
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

/**
 * One diff line's text, with the part that actually changed marked.
 *
 * The +/− marker is part of the text so the column stays aligned whether or
 * not a line got spans. Without spans this renders exactly what it always did:
 * a line with no partner, or one whose partner shares nothing with it, is a
 * whole-line claim and the row's tint is already making it.
 */
function LineText({
  line,
  spans,
}: {
  line: DiffLine;
  spans: readonly WordSpan[] | undefined;
}) {
  const marker = line.kind === "add" ? "+" : line.kind === "del" ? "-" : " ";
  if (!spans) {
    return (
      <>
        {marker}
        {line.text}
      </>
    );
  }
  return (
    <>
      {marker}
      {spans.map((span, index) =>
        span.changed ? (
          <mark key={index}>{span.text}</mark>
        ) : (
          <Fragment key={index}>{span.text}</Fragment>
        ),
      )}
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
function Body({ file, split }: { file: FileDiff; split: boolean }) {
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

  if (split) return <SplitBody file={file} words={words} />;

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
                <LineText line={line} spans={words.get(line)} />
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
}: {
  file: FileDiff;
  words: Map<DiffLine, readonly WordSpan[]>;
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
              <Half line={row.left} side="old" words={words} />
              <Half line={row.right} side="new" words={words} />
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
}: {
  line: DiffLine | undefined;
  side: "old" | "new";
  words: Map<DiffLine, readonly WordSpan[]>;
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
        {line === undefined ? "" : <LineText line={line} spans={words.get(line)} />}
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

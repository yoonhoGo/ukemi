import { useEffect, useMemo, useRef, useState } from "react";
import type { FileDiff, Revision } from "@ukemi/domain";
import { parseGitDiff } from "@ukemi/domain";
import { useFileDiff } from "../repo.tsx";
import { t } from "../i18n/i18n.ts";
import { nodeColor } from "./change-color.ts";
import { STATUS_MARK } from "./Inspector.tsx";
import { useModal } from "./modal.ts";

/**
 * The diff reader.
 *
 * The inspector is 372px wide, which is narrower than the code it was showing:
 * a unified diff wrapped on nearly every line, so reading one meant
 * reconstructing it. The diff is the same diff — jj's own, unified, one
 * column — it just needed a window wide enough to be read in. Nothing here
 * pretends it is side-by-side; the two gutters are the old and new line
 * numbers, not two versions of the file.
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
  const diff = useFileDiff(revision.changeId, undefined);
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
            {file && <Body file={file} />}
          </div>
        </div>

        {/* Which jj command produced what is on screen, the same way the
            window's footer says it for writes. It is also the honest label for
            the shape of the thing: `--git` output is a unified diff. */}
        <div className="sec" style={{ padding: "12px 20px 16px", fontSize: 12 }}>
          <span className="mono">
            jj diff -r {revision.changeId.slice(0, 8)} --git
          </span>
        </div>
      </div>
    </div>
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
function Body({ file }: { file: FileDiff }) {
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
                {line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}
                {line.text}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const ROW: React.CSSProperties = {
  gridTemplateColumns: "44px 44px max-content",
  whiteSpace: "pre",
  wordBreak: "normal",
};

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

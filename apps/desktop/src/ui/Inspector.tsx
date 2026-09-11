import { useEffect, useState } from "react";
import type { ChangeId, FileChange, Revision } from "@ukemi/domain";
import { fileHistoryRevset } from "@ukemi/domain";
import {
  messageFor,
  useDiffSummary,
  useEvolog,
  useJjMutation,
  useLog,
  useRepo,
} from "../repo.tsx";
import { t } from "../i18n/i18n.ts";
import { authorColor, authorInitials, colorForChange, nodeColor } from "./change-color.ts";
import { relativeTime } from "./time.ts";
import type { HunkSheetMode } from "./HunkSheet.tsx";
import { Conflicts } from "./Conflicts.tsx";
import { ChevronIcon } from "./icons.tsx";
import { StackPanel } from "./Stack.tsx";

/** Exported because the diff sheet lists the same files with the same marks. */
export const STATUS_MARK: Record<FileChange["status"], { mark: string; color: string }> = {
  added: { mark: "A", color: "var(--u-added)" },
  modified: { mark: "M", color: "var(--u-modified)" },
  removed: { mark: "D", color: "var(--u-removed)" },
  renamed: { mark: "R", color: "var(--u-modified)" },
  copied: { mark: "C", color: "var(--u-modified)" },
};

/**
 * The description editor.
 *
 * There is no staging area to decide what goes in, so the description is
 * editable at all times and for any revision, not just the tip (design §4.2).
 * Committed on ⌘↩ or blur; Esc abandons the edit.
 */
function DescriptionEditor({ revision }: { revision: Revision }) {
  const [draft, setDraft] = useState(revision.description);
  const describe = useJjMutation((port, message: string) =>
    port.describe(revision.changeId, message),
  );

  // Re-seed when the selection changes, or the previous revision's text would
  // leak into the next one's editor.
  useEffect(() => setDraft(revision.description), [revision.changeId, revision.description]);

  const dirty = draft !== revision.description;
  const commit = () => {
    if (dirty) describe.mutate(draft);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "8px 10px",
        borderRadius: 7,
        background: "var(--u-bg-raised)",
        border: "1px solid var(--u-line-strong)",
      }}
    >
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.metaKey) {
            event.preventDefault();
            commit();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            setDraft(revision.description);
            event.currentTarget.blur();
          }
          // Everything else is text entry: keep the window's shortcuts out of it.
          event.stopPropagation();
        }}
        placeholder={t("Describe this change…")}
        rows={Math.min(6, Math.max(2, draft.split("\n").length))}
        spellCheck={false}
        style={{
          resize: "none",
          font: "inherit",
          color: "inherit",
          background: "transparent",
          userSelect: "text",
          cursor: "text",
          outline: "none",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="sec" style={{ fontSize: "var(--u-font-size-small)" }}>
          {describe.isPending ? t("Saving…") : dirty ? t("Unsaved") : ""}
        </span>
        <span style={{ flexGrow: 1 }} />
        <span className="key">⌘↩</span>
      </div>
    </div>
  );
}

/** One jj verb, its shortcut, and why it is or is not available right now. */
function Step({
  label,
  shortcut,
  onRun,
  disabled,
  title,
  primary,
}: {
  label: string;
  /** Omitted by the rows the file list grows, which have no chord of their own. */
  shortcut?: string | undefined;
  onRun(): void;
  disabled?: boolean | undefined;
  title?: string | undefined;
  primary?: boolean | undefined;
}) {
  return (
    <button
      type="button"
      className="step"
      onClick={onRun}
      disabled={disabled}
      title={title}
      {...(primary ? { "data-variant": "primary" } : {})}
    >
      <span>{label}</span>
      {shortcut && <span className="key">{shortcut}</span>}
    </button>
  );
}

/**
 * Every version this change has been — differentiator #1, per change.
 *
 * The timeline below the window is the *repository's* history; this is one
 * change's. Git has no equivalent at all: an amended commit's previous self is
 * reachable only through the reflog, by SHA, and only until it is collected.
 * Here the change ID is stable and every version it has worn is still there.
 *
 * Folded shut, and the read is wired to the fold rather than the selection —
 * walking the graph must not run a second jj command per row for a panel
 * nobody opened.
 */
function Evolution({ revision }: { revision: Revision }) {
  const [open, setOpen] = useState(false);
  const history = useEvolog(open ? revision.changeId : undefined);
  // The head of the list is the version on screen; the older ones are what the
  // panel exists for, so a change that has only ever been itself says so.
  const past = (history.data ?? []).slice(1);

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      style={{ padding: "10px 16px 8px", borderTop: "1px solid var(--u-line-faint)" }}
    >
      <summary
        className="side-head"
        style={{ display: "flex", alignItems: "center", gap: 6, padding: 0 }}
      >
        <span className="chev" aria-hidden>
          <ChevronIcon />
        </span>
        {t("HOW THIS CHANGE EVOLVED")}
      </summary>
      <div style={{ paddingTop: 6 }}>
        {history.error && (
          <div
            role="alert"
            className="mono selectable"
            style={{ fontSize: 11, color: "var(--u-conflict)", whiteSpace: "pre-wrap" }}
          >
            {messageFor(history.error)}
          </div>
        )}
        {!history.error && history.isPending && (
          <div className="sec" style={{ fontSize: 11.5 }}>
            {t("Reading the change's history…")}
          </div>
        )}
        {!history.error && history.data && past.length === 0 && (
          <div className="sec" style={{ fontSize: 11.5 }}>
            {t("This change has only ever been itself.")}
          </div>
        )}
        {past.map((entry) => (
          <div
            key={entry.commitId}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              minHeight: 22,
              paddingLeft: 8,
              borderLeft: `3px solid ${colorForChange(entry.commitId)}`,
            }}
          >
            {/* The commit ID, not the change ID: the change ID is the same on
                every row here, and the commit ID is the only thing that tells
                two versions apart — it is also what `jj show` takes. */}
            <span className="mono ter selectable" style={{ fontSize: 11, flexShrink: 0 }}>
              {entry.commitId.slice(0, 8)}
            </span>
            <span
              style={{
                flexGrow: 1,
                minWidth: 0,
                fontSize: 11.5,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={entry.description || undefined}
            >
              {entry.description.split("\n")[0] || t("(no description set)")}
            </span>
            {entry.hasConflict && (
              <span className="pill" data-kind="conflict">
                {t("conflict")}
              </span>
            )}
            <span className="sec" style={{ fontSize: 11, flexShrink: 0 }}>
              {relativeTime(entry.committer.timestamp)}
            </span>
          </div>
        ))}
        {past.length > 0 && (
          <div className="mono ter" style={{ fontSize: 11, paddingTop: 6 }}>
            {`jj evolog -r ${revision.changeId.slice(0, 8)}`}
          </div>
        )}
      </div>
    </details>
  );
}

export function Inspector({
  revision,
  extraParents = [],
  onStartChange,
  onOpenSheet,
  onOpenDiff,
}: {
  revision: Revision | undefined;
  /** Rows ⌘-clicked as extra parents; with any, ⌘N is a merge. */
  extraParents?: readonly ChangeId[] | undefined;
  /** The window's ⌘N, so the step and the key do the same thing. */
  onStartChange?(): void;
  onOpenSheet(mode: HunkSheetMode): void;
  /** `against` opens the sheet comparing this revision's patch with that one's. */
  onOpenDiff(path: string, against?: string): void;
}) {
  const { isPinned, setRevset } = useRepo();
  const files = useDiffSummary(revision?.changeId);
  const log = useLog();

  const newChange = useJjMutation((port, parents: readonly string[]) => port.newChange(parents));
  const edit = useJjMutation((port, rev: string) => port.edit(rev));
  const abandon = useJjMutation((port, rev: string) => port.abandon([rev]));
  const absorb = useJjMutation((port, rev: string) => port.absorb(rev));
  const squashFiles = useJjMutation(
    (port, args: { from: string; into: string; paths: readonly string[] }) =>
      port.squash(args),
  );
  const splitFiles = useJjMutation((port, args: { rev: string; paths: readonly string[] }) =>
    port.split(args),
  );
  const takeAuthorship = useJjMutation((port, rev: string) => port.takeAuthorship(rev));
  const parallelize = useJjMutation((port, revs: readonly string[]) => port.parallelize(revs));
  const simplifyParents = useJjMutation((port, rev: string) => port.simplifyParents(rev));
  const restoreFiles = useJjMutation(
    (port, args: { rev: string; paths: readonly string[] }) => port.restoreFiles(args),
  );

  // Which files the two whole-file verbs below act on. Cleared when the
  // selection moves, or the last revision's checks would carry over onto the
  // paths of the next one.
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => setPicked(new Set()), [revision?.changeId]);

  if (!revision) {
    return (
      <aside className="u-scroll" style={panelStyle}>
        <div className="sec" style={{ padding: 16 }}>
          {t("Select a revision.")}
        </div>
      </aside>
    );
  }

  const color = nodeColor(revision);
  const readOnly = isPinned || revision.isImmutable;
  const readOnlyReason = isPinned
    ? t("The window is parked on a past operation. Return to now to make changes.")
    : revision.isImmutable
      ? t("This revision is immutable.")
      : undefined;

  // Read off the file list rather than the checked set itself: another session
  // can commit under us, and a path that is no longer in the diff is not a path
  // to hand jj.
  const picks = files.data?.filter((file) => picked.has(file.path)).map((file) => file.path) ?? [];
  const parent = revision.parents.length === 1 ? revision.parents[0] : undefined;
  // The parent's own row came down with the graph, so this guard is free.
  // ponytail: a parent outside the visible revset is unknown here and falls
  // through to jj's own refusal, which the error line below shows.
  const parentImmutable =
    log.data?.some((row) => row.changeId === parent && row.isImmutable) === true;
  const canSquash = !readOnly && parent !== undefined && !parentImmutable;
  // Splitting every file out would leave this change empty and the new one
  // holding everything — a rename, not a split.
  const canSplit = !readOnly && picks.length < (files.data?.length ?? 0);

  return (
    <aside className="u-scroll" style={panelStyle}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: "14px 16px 12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="mono selectable" style={{ fontSize: 15, fontWeight: 600 }}>
            <span style={{ color }}>{revision.changeId.slice(0, 2)}</span>
            {revision.changeId.slice(2, 12)}
          </div>
          {revision.isWorkingCopy && <span className="pill">{t("@ working copy")}</span>}
          {revision.hasConflict && (
            <span className="pill" data-kind="conflict">
              {t("conflict")}
            </span>
          )}
          <span style={{ flexGrow: 1 }} />
          <span className="mono ter selectable" style={{ fontSize: 11 }}>
            {revision.commitId.slice(0, 7)}
          </span>
        </div>

        {readOnly ? (
          /* A commit message is not one line: its own breaks have to survive
             (`pre-wrap`), a trailer's URL has no break opportunity in it and
             ran off the right edge of a 372px panel (`anywhere`), and a long
             body would otherwise push the steps below it off the panel. It
             opts into selection because a message one cannot edit is a
             message one copies. */
          <div
            className="sec selectable u-scroll"
            style={{
              padding: "8px 10px",
              borderRadius: 7,
              background: "var(--u-bg-sunken)",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              maxHeight: 180,
            }}
          >
            {revision.description || t("(no description set)")}
          </div>
        ) : (
          <DescriptionEditor revision={revision} />
        )}

        <div
          className="sec"
          style={{ display: "flex", gap: 14, fontSize: 11.5, flexWrap: "wrap" }}
        >
          <span>
            {revision.parents.length === 1 ? t("Parent ") : t("Parents ")}
            {revision.parents.map((parent) => (
              <span className="mono" key={parent}>
                {parent.slice(0, 8)}{" "}
              </span>
            ))}
          </span>
          <span>
            <span
              className="avatar"
              style={{
                background: authorColor(revision.author.email),
                display: "inline-flex",
                width: 16,
                height: 16,
                fontSize: 8,
                verticalAlign: "middle",
                marginRight: 4,
              }}
            >
              {authorInitials(revision.author.name, revision.author.email)}
            </span>
            {revision.author.name || revision.author.email}
          </span>
          <span>{relativeTime(revision.author.timestamp)}</span>
        </div>
      </div>

      <div
        style={{ padding: "0 16px 12px", display: "flex", flexDirection: "column", gap: 6 }}
      >
        <div className="side-head" style={{ padding: 0 }}>
          {t("NEXT STEPS")}
        </div>
        {/* Every step below greys out together, and a `title` on each is a
            tooltip the user has to go looking for. The reason is already
            computed, so it is said once, in the open. */}
        {readOnlyReason && (
          <div className="sec" style={{ fontSize: 11.5 }}>
            {readOnlyReason}
          </div>
        )}
        <Step
          label={
            extraParents.length > 0
              ? t("Merge with {count} marked", { count: String(extraParents.length) })
              : t("Start new change on top")
          }
          shortcut="⌘N"
          primary
          disabled={isPinned}
          title={isPinned ? readOnlyReason : undefined}
          onRun={
            onStartChange ?? (() => newChange.mutate([revision.changeId, ...extraParents]))
          }
        />
        {extraParents.length === 0 && (
          <div className="sec" style={{ fontSize: 11.5 }}>
            {t("⌘-click another revision to merge with it.")}
          </div>
        )}
        <Step
          label={t("Split into two changes")}
          shortcut="⌘⇧S"
          disabled={readOnly || (files.data?.length ?? 0) === 0}
          title={
            readOnlyReason ??
            ((files.data?.length ?? 0) === 0 ? t("Nothing to split") : undefined)
          }
          onRun={() => onOpenSheet("split")}
        />
        <Step
          label={t("Squash hunks into parent")}
          shortcut="⌘⇧K"
          disabled={
            readOnly || revision.parents.length !== 1 || (files.data?.length ?? 0) === 0
          }
          title={
            readOnlyReason ??
            (revision.parents.length !== 1
              ? t("A merge has no single parent to squash into")
              : (files.data?.length ?? 0) === 0
                ? t("Nothing to squash")
                : undefined)
          }
          onRun={() => onOpenSheet("squash")}
        />
        <Step
          label={t("Absorb into ancestors")}
          shortcut="⌘⇧A"
          disabled={readOnly || revision.isEmpty || absorb.isPending}
          title={
            readOnlyReason ??
            (revision.isEmpty
              ? t("Nothing to absorb")
              : t(
                  "Move each edit into the mutable ancestor that last touched those lines (jj absorb). One ⌘Z takes it back.",
                ))
          }
          onRun={() => absorb.mutate(revision.changeId)}
        />
        {/* jj has no dry run for absorb, so the honest preview is the result:
            jj's own account of what moved where, with undo one key away. */}
        {absorb.data?.message && (
          <div
            className="mono selectable"
            style={{
              fontSize: 11,
              padding: "6px 8px",
              borderRadius: 6,
              background: "var(--u-accent-soft)",
              whiteSpace: "pre-wrap",
            }}
          >
            {absorb.data.message}
          </div>
        )}
        <Step
          label={t("Edit this change")}
          shortcut="⌘E"
          disabled={readOnly || revision.isWorkingCopy}
          title={readOnlyReason}
          onRun={() => edit.mutate(revision.changeId)}
        />
        <Step
          label={t("Abandon this change")}
          shortcut="⌘⌫"
          disabled={readOnly}
          title={readOnlyReason}
          onRun={() => abandon.mutate(revision.changeId)}
        />
        {/* The three below change topology or metadata, never content, and
            none is reached often enough to earn a chord — the same reason the
            whole-file squash and split below have none. */}
        {extraParents.length > 0 && (
          <Step
            label={t("Make {count} marked siblings of this one", {
              count: String(extraParents.length),
            })}
            disabled={readOnly || parallelize.isPending}
            title={
              readOnlyReason ??
              t(
                "Turn a chain into siblings so they no longer sit on top of each other (jj parallelize). jj refuses if they are not connected.",
              )
            }
            onRun={() => parallelize.mutate([revision.changeId, ...extraParents])}
          />
        )}
        {revision.parents.length > 1 && (
          <Step
            label={t("Simplify the parent edges")}
            disabled={readOnly || simplifyParents.isPending}
            title={
              readOnlyReason ??
              t(
                "Drop any parent the other parents already reach (jj simplify-parents). Topology only — the content does not move.",
              )
            }
            onRun={() => simplifyParents.mutate(revision.changeId)}
          />
        )}
        <Step
          label={t("Make this change mine")}
          disabled={readOnly || takeAuthorship.isPending}
          title={
            readOnlyReason ??
            t(
              "Put your name and email on it as the author (jj metaedit --update-author). The content does not change.",
            )
          }
          onRun={() => takeAuthorship.mutate(revision.changeId)}
        />
        {(takeAuthorship.error ?? parallelize.error ?? simplifyParents.error) && (
          <div
            role="alert"
            className="mono selectable"
            style={{ fontSize: 11, color: "var(--u-conflict)", whiteSpace: "pre-wrap" }}
          >
            {messageFor(takeAuthorship.error ?? parallelize.error ?? simplifyParents.error)}
          </div>
        )}
      </div>

      {revision.hasConflict && (
        <Conflicts revision={revision} onShowRevision={() => onOpenSheet("split")} />
      )}

      {!revision.isImmutable && (
        <StackPanel revision={revision} onOpenDiff={onOpenDiff} />
      )}

      <div
        style={{
          padding: "10px 16px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          borderTop: "1px solid var(--u-line-faint)",
        }}
      >
        {/* The rows used to expand a diff in place, in 372px, where it wrapped
            on nearly every line. They open the wide sheet now — one behaviour,
            not "expands sometimes and opens a sheet other times" — and the
            head says so, the way the hunk sheet teaches its own keys. */}
        <div className="side-head" style={{ padding: "0 0 4px" }}>
          {files.data
            ? t("{count} FILES CHANGED", { count: files.data.length })
            : t("FILES CHANGED")}
          {(files.data?.length ?? 0) > 0 && ` · ${t("click for the diff")}`}
        </div>
        {files.data?.length === 0 && (
          <div className="sec" style={{ fontSize: 12 }}>
            {t("No file changes.")}
          </div>
        )}
        {files.data?.map((file) => {
          const status = STATUS_MARK[file.status];
          const checked = picked.has(file.path);
          return (
            /* The row is already a button that opens the diff, so the check
               box cannot sit inside it — a button within a button is not
               something the browser honours. It becomes a sibling, and the row
               keeps its one job. */
            <div key={file.path} style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                disabled={readOnly}
                title={readOnlyReason ?? t("Check files to squash or split them whole")}
                onClick={() =>
                  setPicked((previous) => {
                    const next = new Set(previous);
                    if (checked) next.delete(file.path);
                    else next.add(file.path);
                    return next;
                  })
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 14,
                  height: 14,
                  flexShrink: 0,
                  marginRight: 2,
                  borderRadius: 4,
                  border: `1px solid ${checked ? "var(--u-accent)" : "var(--u-line-strong)"}`,
                  background: checked ? "var(--u-accent)" : "transparent",
                  color: "var(--u-accent-ink)",
                  fontSize: 10,
                  lineHeight: 1,
                }}
              >
                {checked ? "✓" : ""}
              </button>
              <button
                type="button"
                className="file"
                onClick={() => onOpenDiff(file.path)}
                title={file.path}
                style={{ minWidth: 0 }}
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
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    direction: "rtl",
                    textAlign: "left",
                  }}
                >
                  {file.path}
                </span>
              </button>
              {/* The file's history is a revset (`files("path")`), so the
                  graph itself is the history view — no second list to build,
                  and ⌘1 is the way back. */}
              <button
                type="button"
                className="ter"
                onClick={() => setRevset(fileHistoryRevset(file.path))}
                title={t("Show every revision that touched {path}", { path: file.path })}
                aria-label={t("Show every revision that touched {path}", { path: file.path })}
                style={{ flexShrink: 0, padding: "0 4px", fontSize: 12 }}
              >
                ↺
              </button>
            </div>
          );
        })}

        {/* Whole-file squash and split. The hunk sheet is the finer tool; this
            is the unit most edits are actually in, so it lives beside the list
            it acts on and appears only once something is checked.
            ponytail: the parent and a new change below are the only two
            targets — squashing into an arbitrary revision wants a target
            picker, which nothing has asked for yet. */}
        {picks.length > 0 && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 6 }}
          >
            <Step
              label={t("Squash {count} files into the parent", { count: picks.length })}
              disabled={!canSquash || squashFiles.isPending}
              title={
                readOnlyReason ??
                (parent === undefined
                  ? t("A merge has no single parent to squash into")
                  : parentImmutable
                    ? t("The parent is immutable.")
                    : t(
                        "Move the checked files whole into the parent change (jj squash). One ⌘Z takes it back.",
                      ))
              }
              onRun={() => {
                // `parent` is what `canSquash` is built on; repeated for the
                // type checker, which cannot see through the boolean.
                if (!canSquash || parent === undefined) return;
                squashFiles.mutate(
                  { from: revision.changeId, into: parent, paths: picks },
                  { onSuccess: () => setPicked(new Set()) },
                );
              }}
            />
            <Step
              label={t("Split {count} files into a new change", { count: picks.length })}
              disabled={!canSplit || splitFiles.isPending}
              title={
                readOnlyReason ??
                (!canSplit
                  ? t("Leave at least one file behind")
                  : t(
                      "Move the checked files whole into a new change below this one (jj split). This change keeps its description.",
                    ))
              }
              onRun={() => {
                if (!canSplit) return;
                splitFiles.mutate(
                  { rev: revision.changeId, paths: picks },
                  { onSuccess: () => setPicked(new Set()) },
                );
              }}
            />
            {/* Squash moves the work, split parks it, and this throws it
                away — the one thing a Git client offers on a file that jj's
                inspector had no button for. Destructive in the ordinary sense
                and not in this one: it is an operation like any other, so the
                title says where the way back is. */}
            <Step
              label={t("Discard changes to {count} files", { count: picks.length })}
              disabled={readOnly || restoreFiles.isPending}
              title={
                readOnlyReason ??
                t(
                  "Put the checked files back the way the parent has them (jj restore). One ⌘Z takes it back.",
                )
              }
              onRun={() =>
                restoreFiles.mutate(
                  { rev: revision.changeId, paths: picks },
                  { onSuccess: () => setPicked(new Set()) },
                )
              }
            />
            {(squashFiles.error ?? splitFiles.error ?? restoreFiles.error) && (
              <div
                role="alert"
                className="mono selectable"
                style={{
                  fontSize: 11,
                  color: "var(--u-conflict)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {messageFor(squashFiles.error ?? splitFiles.error ?? restoreFiles.error)}
              </div>
            )}
          </div>
        )}
      </div>

      <Evolution revision={revision} />
    </aside>
  );
}

/**
 * The panel scrolls as one block rather than pinning a header over a scrolling
 * diff: the steps, the stack and the file list together outgrow the window
 * long before the diff does, and as flex items they were clipped with no way
 * to reach them.
 */
const panelStyle: React.CSSProperties = {
  width: 372,
  flexShrink: 0,
  background: "var(--u-bg-inspector)",
  borderLeft: "1px solid var(--u-line)",
};

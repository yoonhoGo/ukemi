import { useEffect, useMemo, useState } from "react";
import type { DiffGroup, FileDiff, PlanFile, Revision } from "@ukemi/domain";
import { allGroups, applySelectedGroups } from "@ukemi/domain";
import { useHunkEditData, useJjMutation } from "../repo.tsx";
import { t, tParts } from "../i18n/i18n.ts";
import { nodeColor } from "./change-color.ts";

/**
 * The hunk editor — design §4.2, "커밋 편집" without a staging area.
 *
 * The question is never "what should I commit"; the working copy is already a
 * commit. It is "how do I split this one" or "which commit should this go to",
 * so the same selection drives both verbs and the sheet only changes its
 * wording.
 *
 * Selection is per *group* — a contiguous run of changed lines — not per jj
 * hunk, because jj pads a hunk with context and can report two unrelated edits
 * as one block. Line-by-line selection (the design's "⇧ + click to split
 * finer") is not here yet; groups are the natural unit the diff supports and
 * cover the cases that motivated the feature.
 */
export type HunkSheetMode = "split" | "squash";

const COPY: Record<
  HunkSheetMode,
  {
    title: string;
    blurb: string;
    keptLabel: string;
    restLabel: string;
    verb: string;
  }
> = {
  split: {
    title: "Split {change} into two changes",
    blurb:
      "Checked hunks stay in the first change. Everything else moves to a new change on top. Nothing is staged; both are real commits when you finish.",
    keptLabel: "First change",
    restLabel: "New change on top",
    verb: "Split",
  },
  squash: {
    title: "Squash part of {change} into its parent",
    blurb:
      "Checked hunks move into the parent commit. Everything else stays where it is. The parent keeps its own description.",
    keptLabel: "Moves into parent",
    restLabel: "Stays here",
    verb: "Squash",
  },
};

/** A selectable entry: one group, labelled by file and position. */
interface Entry {
  readonly group: DiffGroup;
  readonly file: FileDiff;
  readonly label: string;
}

function entriesFor(files: readonly FileDiff[]): Entry[] {
  const out: Entry[] = [];
  for (const file of files) {
    if (file.isBinary) {
      // A binary file cannot be split by hunk, so it is one all-or-nothing row.
      out.push({
        group: {
          id: `${file.path}#binary`,
          lines: [],
          oldStart: 0,
          newStart: 0,
          additions: 0,
          deletions: 0,
        },
        file,
        label: t("binary"),
      });
      continue;
    }
    for (const group of allGroups(file)) {
      out.push({
        group,
        file,
        label:
          file.status === "added"
            ? t("new file")
            : file.status === "removed"
              ? t("deleted")
              : `@${group.oldStart}`,
      });
    }
  }
  return out;
}

/** Build the plan describing what the kept side should contain. */
function planFor(
  files: readonly FileDiff[],
  before: ReadonlyMap<string, string>,
  selected: ReadonlySet<string>,
): PlanFile[] {
  const plan: PlanFile[] = [];
  for (const file of files) {
    const groups = file.isBinary
      ? [{ id: `${file.path}#binary` }]
      : allGroups(file).map((group) => ({ id: group.id }));
    const chosen = groups.filter((group) => selected.has(group.id));

    if (chosen.length === groups.length && groups.length > 0) {
      // Everything in this file is kept: jj already staged exactly that.
      continue;
    }
    if (chosen.length === 0) {
      // Nothing kept. A file this change *added* must not exist on the kept
      // side; anything else comes back from the pre-change tree — which is also
      // the only way to decline a deletion, since there is no copy to edit.
      plan.push(
        file.status === "added"
          ? { path: file.path, op: "delete" }
          : { path: file.path, op: "revert" },
      );
      continue;
    }
    const left = before.get(file.path) ?? "";
    plan.push({
      path: file.path,
      op: "write",
      content: applySelectedGroups(left, file, selected),
    });
  }
  return plan;
}

export function HunkSheet({
  revision,
  mode,
  onClose,
}: {
  revision: Revision;
  mode: HunkSheetMode;
  onClose(): void;
}) {
  const data = useHunkEditData(revision.changeId);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [focused, setFocused] = useState<string | undefined>(undefined);
  // Split leaves the extracted change without a description — jj's `split -m`
  // gives the *selected* side the message and the other keeps the original. A
  // field here beats discovering an unnamed commit afterwards. Squash has no
  // new change to name, so it does not show one.
  const [message, setMessage] = useState("");
  const copy = COPY[mode];
  // Korean puts the change ID first and the verb last, so the sentence stays one
  // key and the coloured ID drops into the slot.
  const [beforeChange, afterChange] = tParts(copy.title, "change");
  const [beforeCommand, afterCommand] = tParts("Runs {command} · undo with", "command");

  const splitHunks = useJjMutation((port, plan: PlanFile[]) =>
    port.splitHunks({ rev: revision.changeId, keep: plan, message }),
  );
  const squashHunks = useJjMutation((port, plan: PlanFile[]) =>
    port.squashHunks({
      from: revision.changeId,
      into: revision.parents[0]!,
      keep: plan,
    }),
  );
  const run = mode === "split" ? splitHunks : squashHunks;

  const entries = useMemo(() => entriesFor(data.data?.files ?? []), [data.data]);

  // Focus the first entry once the diff arrives, so the pane is never blank.
  useEffect(() => {
    if (focused === undefined && entries.length > 0) setFocused(entries[0]!.group.id);
  }, [entries, focused]);

  const toggle = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const focusedEntry = entries.find((entry) => entry.group.id === focused);
  const keptCount = selected.size;
  const restCount = entries.length - keptCount;
  const blocked = data.data?.problem !== undefined;
  const canRun = keptCount > 0 && restCount > 0 && !blocked && !run.isPending;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === " " && focused) {
        event.preventDefault();
        toggle(focused);
        return;
      }
      if (event.key.toLowerCase() === "a" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setSelected((previous) =>
          previous.size === entries.length
            ? new Set()
            : new Set(entries.map((entry) => entry.group.id)),
        );
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const index = entries.findIndex((entry) => entry.group.id === focused);
        const next = entries[Math.min(entries.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))];
        if (next) setFocused(next.group.id);
        return;
      }
      if (event.key === "Enter" && event.metaKey && canRun && data.data) {
        event.preventDefault();
        run.mutate(planFor(data.data.files, data.data.before, selected), {
          onSuccess: onClose,
        });
      }
      // Everything else stays inside the sheet.
      event.stopPropagation();
    };
    // Capture, so the window's shortcuts do not also fire while the sheet is up.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [entries, focused, canRun, selected, data.data, run, onClose]);

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
        role="dialog"
        aria-label={t(copy.verb)}
        onClick={(event) => event.stopPropagation()}
        style={{
          display: "flex",
          flexDirection: "column",
          width: 920,
          height: 640,
          maxWidth: "94vw",
          maxHeight: "92vh",
          borderRadius: 12,
          overflow: "hidden",
          background: "var(--u-bg-sidebar)",
          boxShadow: "0 30px 70px rgba(0,0,0,0.28), 0 0 0 1px var(--u-line)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "18px 20px 10px" }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            {beforeChange}
            <span className="mono" style={{ color: nodeColor(revision) }}>
              {revision.changeId.slice(0, 2)}
            </span>
            <span className="mono sec">{revision.changeId.slice(2, 8)}</span>
            {afterChange}
          </div>
          <div className="sec">{t(copy.blurb)}</div>
          {mode === "split" && (
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                // ⌘↩ still submits; everything else is text entry.
                if (!(event.key === "Enter" && event.metaKey)) event.stopPropagation();
              }}
              placeholder={t("Describe the first change… (optional)")}
              spellCheck={false}
              style={{
                marginTop: 8,
                height: 28,
                padding: "0 10px",
                borderRadius: 6,
                background: "var(--u-bg-raised)",
                border: "1px solid var(--u-line-strong)",
                outline: "none",
                userSelect: "text",
                cursor: "text",
              }}
            />
          )}
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
              gap: 6,
              padding: 10,
              borderRadius: 9,
              background: "var(--u-bg-raised)",
              border: "1px solid var(--u-line)",
            }}
          >
            <div className="side-head" style={{ padding: "2px 4px" }}>
              {t("HUNKS")} · <span className="key">space</span> {t("toggle")} ·{" "}
              <span className="key">⌘A</span> {t("all")}
            </div>
            {data.isPending && <div className="sec">{t("Reading the diff…")}</div>}
            {entries.length === 0 && !data.isPending && (
              <div className="sec">{t("This revision changes nothing.")}</div>
            )}
            {entries.map((entry) => {
              const checked = selected.has(entry.group.id);
              return (
                <button
                  type="button"
                  key={entry.group.id}
                  onClick={() => {
                    setFocused(entry.group.id);
                    toggle(entry.group.id);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    height: 28,
                    padding: "0 6px",
                    borderRadius: 6,
                    textAlign: "left",
                    background:
                      entry.group.id === focused ? "var(--u-accent-soft)" : "transparent",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 14,
                      height: 14,
                      flexShrink: 0,
                      borderRadius: 4,
                      border: `1px solid ${checked ? "var(--u-accent)" : "var(--u-line-strong)"}`,
                      background: checked ? "var(--u-accent)" : "transparent",
                      color: "var(--u-accent-ink)",
                      fontSize: 10,
                      lineHeight: 1,
                    }}
                  >
                    {checked ? "✓" : ""}
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
                    title={entry.file.path}
                  >
                    {entry.file.path}
                  </span>
                  <span className="mono ter" style={{ flexShrink: 0, fontSize: 11 }}>
                    {entry.label}
                  </span>
                </button>
              );
            })}
            <div style={{ flexGrow: 1 }} />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: 8,
                borderRadius: 7,
                background: "var(--u-bg-sunken)",
              }}
            >
              <Tally color="var(--u-accent)" label={t(copy.keptLabel)} count={keptCount} />
              <Tally color="var(--u-added)" label={t(copy.restLabel)} count={restCount} />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              borderRadius: 9,
              overflow: "hidden",
              background: "var(--u-bg-raised)",
              border: "1px solid var(--u-line)",
            }}
          >
            {focusedEntry ? (
              <HunkPreview entry={focusedEntry} selected={selected.has(focusedEntry.group.id)} />
            ) : (
              <div className="sec" style={{ padding: 12 }}>
                {t("Select a hunk.")}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px 18px" }}>
          <span className="sec" style={{ fontSize: 12 }}>
            {blocked ? (
              <span style={{ color: "var(--u-conflict)" }}>
                {/* Refusing is the only safe answer: jj would commit whatever
                    tree we hand it, including a wrong one. */}
                {t("Cannot edit by hunk — {problem}", {
                  problem: data.data?.problem ?? "",
                })}
              </span>
            ) : (
              <>
                {beforeCommand}
                <span className="mono">jj {mode}</span>
                {afterCommand}{" "}
                <span className="key">⌘Z</span>
              </>
            )}
          </span>
          <span style={{ flexGrow: 1 }} />
          <button type="button" className="tb-btn" onClick={onClose}>
            {t("Cancel")} <span className="key">esc</span>
          </button>
          <button
            type="button"
            className="tb-btn"
            data-variant="primary"
            disabled={!canRun}
            title={
              keptCount === 0
                ? t("Check at least one hunk")
                : restCount === 0
                  ? t("Leave at least one hunk behind")
                  : undefined
            }
            onClick={() =>
              data.data &&
              run.mutate(planFor(data.data.files, data.data.before, selected), {
                onSuccess: onClose,
              })
            }
          >
            {run.isPending ? t("Working…") : t(copy.verb)} <span className="key">⌘↩</span>
          </button>
        </div>

        {run.error && (
          <div
            role="alert"
            className="mono selectable"
            style={{
              padding: "8px 20px 14px",
              fontSize: 11.5,
              color: "var(--u-conflict)",
              whiteSpace: "pre-wrap",
            }}
          >
            {run.error instanceof Error ? run.error.message : String(run.error)}
          </div>
        )}
      </div>
    </div>
  );
}

function Tally({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: color }} />
      <span style={{ flexGrow: 1, fontSize: 12 }}>{label}</span>
      <span className="sec" style={{ fontSize: 11 }}>
        {count === 1 ? t("1 hunk") : t("{count} hunks", { count })}
      </span>
    </div>
  );
}

/**
 * The focused hunk, in context.
 *
 * Both line-number columns are shown, as the design does: when you are deciding
 * where a change goes, "which line was this before" is as load-bearing as
 * "which line is it now".
 */
function HunkPreview({ entry, selected }: { entry: Entry; selected: boolean }) {
  const hunk = entry.file.hunks.find((candidate) =>
    candidate.groups.some((group) => group.id === entry.group.id),
  );

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 30,
          flexShrink: 0,
          padding: "0 10px",
          fontSize: 11.5,
          background: "var(--u-bg-sunken)",
          borderBottom: "1px solid var(--u-line-faint)",
        }}
      >
        <span className="mono">{entry.file.path}</span>
        {hunk && <span className="mono sec">{hunk.header.split("@@")[1]?.trim()}</span>}
        <span style={{ flexGrow: 1 }} />
        <span className="sec">{selected ? t("checked") : t("unchecked")}</span>
      </div>
      <div className="u-scroll mono selectable" style={{ flexGrow: 1, padding: "6px 0" }}>
        {entry.file.isBinary && (
          <div className="sec" style={{ padding: "0 10px" }}>
            {t("Binary file — it can only be taken or left whole.")}
          </div>
        )}
        {hunk?.lines.map((line, index) => {
          const inFocus = entry.group.lines.includes(line);
          const kind =
            line.kind === "add" ? "add" : line.kind === "del" ? "del" : undefined;
          return (
            <div
              key={index}
              className="diff-line"
              {...(kind ? { "data-kind": kind } : {})}
              style={{
                gridTemplateColumns: "34px 34px minmax(0,1fr)",
                // The focused group is what the checkbox acts on, so it is
                // marked in the pane too; the rest is context.
                boxShadow: inFocus ? "inset 2px 0 0 var(--u-accent)" : undefined,
                opacity: inFocus || line.kind === "context" ? 1 : 0.55,
              }}
            >
              <span className="ln">{line.oldLine ?? ""}</span>
              <span className="ln">{line.newLine ?? ""}</span>
              <span>
                {line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}
                {line.text}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

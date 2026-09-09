import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ChangeId, RebaseMode } from "@ukemi/domain";
import { JjError } from "@ukemi/jj-cli-adapter";
import {
  LOG_LIMIT,
  RepoProvider,
  useCommandLog,
  useGraph,
  useJjMutation,
  useOperations,
  usePullRequests,
  useRebasePreview,
  useRepo,
} from "./repo.tsx";
import { Board } from "./ui/Board.tsx";
import { CoachBubble, ProgressPanel } from "./ui/Coach.tsx";
import { CommandPanel } from "./ui/CommandPanel.tsx";
import { isRead, shellLine } from "./ui/command-line.ts";
import { Graph } from "./ui/Graph.tsx";
import { Inspector } from "./ui/Inspector.tsx";
import { HunkSheet, type HunkSheetMode } from "./ui/HunkSheet.tsx";
import { milestoneForCommand, reachMilestone } from "./ui/onboarding.ts";
import { Rosetta } from "./ui/Rosetta.tsx";
import { SAVED_REVSETS, Sidebar } from "./ui/Sidebar.tsx";
import { Shortcuts } from "./ui/Shortcuts.tsx";
import { Timeline } from "./ui/Timeline.tsx";
import { Toolbar } from "./ui/Toolbar.tsx";
import { useDragRebase, type DragState } from "./ui/drag-rebase.tsx";
import { DragGhost, RebaseHud } from "./ui/RebaseHud.tsx";
import { DEFAULT_REVSET } from "@ukemi/domain";
import { t, tParts } from "./i18n/i18n.ts";

/**
 * The main window.
 *
 * Layout is Direction A from the design canvas: sidebar, vertical graph,
 * inspector, with the operation timeline as a permanent bottom strip rather
 * than a hidden panel — time travel is the app's premise, so it is always
 * on screen.
 */
function Window({
  recents,
  onOpenRepo,
}: {
  recents: readonly string[];
  onOpenRepo(path?: string): void;
}) {
  const { root, revset, setRevset, isPinned, pin, opId } = useRepo();
  const { layout, query } = useGraph();
  const operations = useOperations(60);
  const client = useQueryClient();
  const [selected, setSelected] = useState<ChangeId | undefined>(undefined);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [sheet, setSheet] = useState<HunkSheetMode | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  // The graph is the window; the board is the same data by workspace (§4.6).
  const [view, setView] = useState<"graph" | "board">("graph");
  const [showCommands, setShowCommands] = useState(false);
  const [showRosetta, setShowRosetta] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const commandLog = useCommandLog();
  const pullRequests = usePullRequests();
  const prsByBranch = useMemo(
    () => new Map((pullRequests.data ?? []).map((pr) => [pr.headBranch, pr])),
    [pullRequests.data],
  );

  const rows = layout?.rows ?? [];
  const conflicts = rows.filter((row) => row.revision.hasConflict).length;
  const [emptyBefore, emptyAfter] = tParts("No revisions match {revset}.", "revset");
  // Default the selection to the working copy: it is the change you are in.
  const effectiveSelection = useMemo(() => {
    if (selected && rows.some((row) => row.revision.changeId === selected)) return selected;
    return rows.find((row) => row.revision.isWorkingCopy)?.revision.changeId
      ?? rows[0]?.revision.changeId;
  }, [selected, rows]);

  const selectedRevision = rows.find(
    (row) => row.revision.changeId === effectiveSelection,
  )?.revision;

  const rebase = useJjMutation(
    (port, args: { mode: RebaseMode; rev: string; onto: string }) =>
      port.rebase(args.mode, args.rev, args.onto),
  );
  const { drag, start: startDrag } = useDragRebase((finished: DragState) => {
    if (!finished.onto) return;
    rebase.mutate({ mode: finished.mode, rev: finished.rev, onto: finished.onto });
  });

  const preview = useRebasePreview(drag?.rev, drag?.onto);
  const movingList = drag ? preview[drag.mode] : undefined;
  const moving = useMemo(() => new Set(movingList ?? []), [movingList]);
  // jj refuses to rebase a revision onto its own descendant, and the moved set
  // is exactly the answer to that question — so the HUD can say so before the
  // drop instead of surfacing an error after it.
  const dropBlocked = drag?.onto !== undefined && moving.has(drag.onto);

  const newChange = useJjMutation((port, parent: string) => port.newChange([parent]));
  const edit = useJjMutation((port, rev: string) => port.edit(rev));
  const abandon = useJjMutation((port, rev: string) => port.abandon([rev]));
  const undo = useJjMutation((port) => port.undo());
  const restore = useJjMutation((port, id: string) => port.restoreOperation(id));
  const fetch = useJjMutation((port) => port.fetch());
  const push = useJjMutation((port) => port.push());
  const absorb = useJjMutation((port, rev: string) => port.absorb(rev));

  const move = useCallback(
    (delta: number) => {
      const index = rows.findIndex((row) => row.revision.changeId === effectiveSelection);
      const next = rows[Math.min(rows.length - 1, Math.max(0, index + delta))];
      if (next) setSelected(next.revision.changeId);
    },
    [rows, effectiveSelection],
  );

  /**
   * The last write this window ran, or — before it has run one — the argv of
   * the most recent operation from the op log (design §4.8).
   */
  const lastWrite = [...commandLog].reverse().find((record) => !isRead(record));
  const lastCommand = lastWrite
    ? shellLine(lastWrite)
    : operations.data?.find((operation) => operation.args)?.args;

  const copyLastCommand = useCallback(() => {
    if (!lastCommand) return;
    void navigator.clipboard.writeText(lastCommand).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }, [lastCommand]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Text fields stop propagation themselves; this is the window's map.
      const key = event.key.toLowerCase();
      const meta = event.metaKey || event.ctrlKey;

      if (event.key === "Escape") {
        if (showRosetta) setShowRosetta(false);
        else if (showProgress) setShowProgress(false);
        else if (showShortcuts) setShowShortcuts(false);
        else if (isPinned) pin(undefined);
        return;
      }
      // The Git-to-jj lookup. Available from the first launch to long after the
      // welcome cards are gone — it is the part of the onboarding that keeps
      // earning its key.
      if (meta && key === "g") {
        event.preventDefault();
        setShowRosetta((open) => !open);
        return;
      }
      if (meta && key === "/") {
        event.preventDefault();
        setShowShortcuts((open) => !open);
        return;
      }
      if (meta && key === "j") {
        event.preventDefault();
        setShowCommands((open) => !open);
        return;
      }
      if (meta && event.shiftKey && key === "w") {
        event.preventDefault();
        setView((current) => (current === "graph" ? "board" : "graph"));
        reachMilestone("workspaces");
        return;
      }
      if (!meta) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          move(1);
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          move(-1);
        }
        return;
      }

      // ⌘-chords below. Writes are refused while the window is parked in the
      // past — the pin is a read pin, and writing from it would fork history
      // silently.
      if (key === "o") {
        event.preventDefault();
        onOpenRepo();
      } else if (key === "r" && event.shiftKey) {
        event.preventDefault();
        if (isPinned && opId) restore.mutate(opId);
      } else if (key === "r") {
        event.preventDefault();
        void client.invalidateQueries({ queryKey: ["op-head", root] });
      } else if (key === "z") {
        event.preventDefault();
        if (!isPinned) undo.mutate(undefined);
      } else if (key === "n") {
        event.preventDefault();
        if (!isPinned && effectiveSelection) newChange.mutate(effectiveSelection);
      } else if (key === "e") {
        event.preventDefault();
        if (!isPinned && effectiveSelection) edit.mutate(effectiveSelection);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        if (!isPinned && effectiveSelection) abandon.mutate(effectiveSelection);
      } else if (key === "s" && event.shiftKey) {
        event.preventDefault();
        if (!isPinned && selectedRevision) setSheet("split");
      } else if (key === "k" && event.shiftKey) {
        event.preventDefault();
        if (!isPinned && selectedRevision?.parents.length === 1) setSheet("squash");
      } else if (key === "a" && event.shiftKey) {
        event.preventDefault();
        if (!isPinned && selectedRevision && !selectedRevision.isEmpty) {
          absorb.mutate(selectedRevision.changeId);
        }
      } else if (key === "f" && event.shiftKey) {
        event.preventDefault();
        if (!isPinned) fetch.mutate(undefined);
      } else if (key === "p" && event.shiftKey) {
        event.preventDefault();
        if (!isPinned) push.mutate(undefined);
      } else if (key === "c" && event.altKey) {
        event.preventDefault();
        copyLastCommand();
      } else if (key >= "1" && key <= "3") {
        event.preventDefault();
        const saved = SAVED_REVSETS[Number(key) - 1];
        if (saved) setRevset(saved.revset);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    showShortcuts,
    showRosetta,
    showProgress,
    isPinned,
    pin,
    move,
    onOpenRepo,
    opId,
    restore,
    client,
    root,
    undo,
    effectiveSelection,
    newChange,
    edit,
    abandon,
    fetch,
    push,
    absorb,
    copyLastCommand,
    setRevset,
    selectedRevision,
  ]);

  const failure = [newChange, edit, abandon, undo, restore, fetch, push, rebase, absorb].find(
    (mutation) => mutation.error,
  )?.error;

  /**
   * Tick off the transition from Git.
   *
   * Five of the seven milestones are read off the command log, so every route
   * to a jj verb counts — the inspector's steps, the hunk sheet, the stack
   * panel, a drag in the graph. `reachMilestone` is idempotent, so rescanning
   * the whole (bounded) log on each new command is cheaper than tracking a
   * cursor, and cannot double-count.
   */
  useEffect(() => {
    for (const record of commandLog) {
      const reached = milestoneForCommand(record);
      if (reached) reachMilestone(reached);
    }
  }, [commandLog]);

  // The sixth has no command behind it: meeting a conflict and finding the app
  // still working *is* the lesson, so seeing one is what reaches it.
  useEffect(() => {
    if (selectedRevision?.hasConflict) reachMilestone("conflicts");
  }, [selectedRevision?.hasConflict]);

  return (
    // `position: relative` is what the coach bubble anchors against: it points
    // at the toolbar, the inspector or the timeline, so the window is its frame.
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <Toolbar
        root={root}
        recents={recents}
        onOpenRepo={onOpenRepo}
        onShowShortcuts={() => setShowShortcuts(true)}
      />

      {isPinned && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            height: 26,
            padding: "0 14px",
            flexShrink: 0,
            background: "var(--u-accent-soft)",
            color: "var(--u-accent)",
            fontSize: "var(--u-font-size-small)",
            fontWeight: 600,
          }}
        >
          {t("Viewing a past operation — the repository is untouched.")}
          <button
            type="button"
            className="tb-btn"
            style={{ height: 20, fontSize: 11, background: "transparent" }}
            onClick={() => pin(undefined)}
          >
            {t("Back to now")} <span className="key">Esc</span>
          </button>
        </div>
      )}

      {(failure || query.error) && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            minHeight: 26,
            padding: "4px 14px",
            flexShrink: 0,
            background: "var(--u-conflict-soft)",
            color: "var(--u-conflict)",
            fontSize: "var(--u-font-size-small)",
          }}
        >
          {/* jj's own stderr, shown verbatim: it is written for humans and is
              more useful than anything we would paraphrase. */}
          <span className="mono selectable" style={{ whiteSpace: "pre-wrap" }}>
            {messageFor(failure ?? query.error)}
          </span>
        </div>
      )}

      <div style={{ display: "flex", flexGrow: 1, minHeight: 0 }}>
        <Sidebar
          view={view}
          onToggleBoard={() => {
            setView((current) => (current === "graph" ? "board" : "graph"));
            reachMilestone("workspaces");
          }}
          onOpenProgress={() => setShowProgress(true)}
        />
        <main
          style={{
            flexGrow: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            background: "var(--u-bg-window)",
          }}
        >
          <div
            className="sec row"
            style={{
              height: 26,
              fontSize: "var(--u-font-size-small)",
              borderBottom: "1px solid var(--u-line-faint)",
              borderRadius: 0,
            }}
          >
            <div />
            <div>{t("Change")}</div>
            <div>{t("Description")}</div>
            <div>{t("Bookmarks")}</div>
            <div />
            <div style={{ textAlign: "right" }}>{t("When")}</div>
          </div>

          {view === "board" && (
            <Board
              onShow={(changeId) => {
                setSelected(changeId);
                setRevset(`${changeId} | (::${changeId} & mutable()) | present(trunk())`);
                setView("graph");
              }}
            />
          )}
          {view === "graph" && query.isPending && (
            <div className="sec" style={{ padding: 16 }}>
              {t("Reading the repository…")}
            </div>
          )}
          {view === "graph" && layout && layout.rows.length === 0 && (
            <div className="sec" style={{ padding: 16 }}>
              {emptyBefore}
              <span className="mono">{revset}</span>
              {emptyAfter}
            </div>
          )}
          {view === "graph" && layout && layout.rows.length > 0 && (
            <Graph
              layout={layout}
              pullRequests={prsByBranch}
              selected={effectiveSelection}
              onSelect={setSelected}
              onDragStart={startDrag}
              moving={drag ? moving : undefined}
              target={drag?.onto}
              targetBlocked={dropBlocked}
            />
          )}

          <div
            className="sec"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              height: 28,
              padding: "0 14px",
              flexShrink: 0,
              fontSize: "var(--u-font-size-small)",
              borderTop: "1px solid var(--u-line-faint)",
            }}
          >
            <span>
              {rows.length === 1
                ? t("1 revision")
                : t("{count} revisions", { count: rows.length })}
              {rows.length >= LOG_LIMIT && ` · ${t("newest only; narrow the revset for more")}`}
              {conflicts > 0 &&
                ` · ${conflicts === 1 ? t("1 conflict") : t("{count} conflicts", { count: conflicts })}`}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span className="key">⌥</span> {t("drag = rebase")}
            </span>
            <span style={{ flexGrow: 1 }} />
            {/* Transparency: the app never hides which jj command it ran. */}
            {lastCommand && (
              <button
                type="button"
                onClick={copyLastCommand}
                onDoubleClick={() => setShowCommands(true)}
                title={t("Copy this command (⌘⌥C). Double-click for every command (⌘J).")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  maxWidth: 460,
                  color: "inherit",
                }}
              >
                <span
                  className="mono"
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {lastCommand}
                </span>
                <span className="key">{copied ? t("copied") : "⌘⌥C"}</span>
              </button>
            )}
          </div>
        </main>
        <Inspector revision={selectedRevision} onOpenSheet={setSheet} />
      </div>

      <CoachBubble onOpenRosetta={() => setShowRosetta(true)} />

      {showCommands && <CommandPanel onClose={() => setShowCommands(false)} />}
      {showRosetta && <Rosetta onClose={() => setShowRosetta(false)} />}
      {showProgress && <ProgressPanel onClose={() => setShowProgress(false)} />}
      <Timeline />
      {drag && (
        <>
          <RebaseHud
            drag={drag}
            moved={preview}
            dragged={rows.find((row) => row.revision.changeId === drag.rev)?.revision}
            target={rows.find((row) => row.revision.changeId === drag.onto)?.revision}
            blocked={dropBlocked}
          />
          {rows.find((row) => row.revision.changeId === drag.rev) && (
            <DragGhost
              drag={drag}
              revision={rows.find((row) => row.revision.changeId === drag.rev)!.revision}
            />
          )}
        </>
      )}
      {sheet && selectedRevision && (
        <HunkSheet
          revision={selectedRevision}
          mode={sheet}
          onClose={() => setSheet(undefined)}
        />
      )}
      {showShortcuts && <Shortcuts onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}

function messageFor(error: unknown): string {
  if (error instanceof JjError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

export function App({
  root,
  recents,
  onOpenRepo,
}: {
  root: string;
  recents: readonly string[];
  onOpenRepo(path?: string): void;
}) {
  return (
    <RepoProvider root={root} initialRevset={DEFAULT_REVSET}>
      <Window recents={recents} onOpenRepo={onOpenRepo} />
    </RepoProvider>
  );
}

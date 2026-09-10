import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ChangeId, RebaseMode } from "@ukemi/domain";
import {
  LOG_LIMIT,
  messageFor,
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
import { DiffSheet } from "./ui/DiffSheet.tsx";
import { isRead, shellLine } from "./ui/command-line.ts";
import { Graph } from "./ui/Graph.tsx";
import { gutterWidth } from "./ui/graph-geometry.ts";
import { Inspector } from "./ui/Inspector.tsx";
import { HunkSheet, type HunkSheetMode } from "./ui/HunkSheet.tsx";
import { installAppMenu } from "./ui/menu.ts";
import { milestoneForCommand, reachMilestone } from "./ui/onboarding.ts";
import { Lookup, type LookupFocus } from "./ui/Lookup.tsx";
import { Settings } from "./ui/Settings.tsx";
import { SAVED_REVSETS, Sidebar } from "./ui/Sidebar.tsx";
import { Shortcuts } from "./ui/Shortcuts.tsx";
import { Timeline } from "./ui/Timeline.tsx";
import { Toolbar } from "./ui/Toolbar.tsx";
import { useDragBookmark, useDragRebase, type DragState } from "./ui/drag-rebase.tsx";
import { DragGhost, RebaseHud } from "./ui/RebaseHud.tsx";
import { DEFAULT_REVSET, stackRevset } from "@ukemi/domain";
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
  // Extra parents for the next ⌘N, toggled with ⌘-click on a row. A merge is
  // a change with two parents, so this is the whole of the merge UI: mark the
  // others, start a change on the selection.
  const [marked, setMarked] = useState<ReadonlySet<ChangeId>>(new Set());
  const toggleMark = (changeId: ChangeId) =>
    setMarked((prev) => {
      const next = new Set(prev);
      if (!next.delete(changeId)) next.add(changeId);
      return next;
    });
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [sheet, setSheet] = useState<HunkSheetMode | undefined>(undefined);
  // The path whose diff is open in the wide sheet, set by a click in the
  // inspector's file list. The revision is the selected one, so this is the
  // whole of the sheet's state that the window has to hold.
  const [diffPath, setDiffPath] = useState<string | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  // The bookmark name being typed, or `undefined` when the strip is closed.
  // An empty string is the open-but-blank state, which is why this is not a
  // boolean paired with the draft.
  const [naming, setNaming] = useState<string | undefined>(undefined);
  // The graph is the window; the board is the same data by workspace (§4.6).
  const [view, setView] = useState<"graph" | "board">("graph");
  const [showCommands, setShowCommands] = useState(false);
  // Which section of the lookup sheet the key that opened it aimed at —
  // `undefined` is closed. One sheet, two entrances: ⌘G at the Git
  // translation, ⌘K at the revset palette.
  const [lookup, setLookup] = useState<LookupFocus | undefined>(undefined);
  const [showProgress, setShowProgress] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
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
  // Only marks still on screen count, and never the selection itself: a mark
  // left on a row the revset no longer shows would merge in something unseen.
  const extraParents = useMemo(
    () =>
      rows
        .map((row) => row.revision.changeId)
        .filter((id) => marked.has(id) && id !== effectiveSelection),
    [rows, marked, effectiveSelection],
  );

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

  // Moving a bookmark is a drop, not a dialog: the way back is ⌘Z, same as
  // every other write in this window.
  const bookmarkSet = useJjMutation((port, args: { name: string; rev: string }) =>
    port.bookmarkSet(args.name, args.rev),
  );
  const { drag: bookmarkDrag, start: startBookmarkDrag } = useDragBookmark(
    (name: string, onto: ChangeId) => {
      if (isPinned) return;
      bookmarkSet.mutate({ name, rev: onto });
    },
  );
  const bookmarkDelete = useJjMutation((port, name: string) => port.bookmarkDelete(name));

  const newChange = useJjMutation((port, parents: readonly string[]) => port.newChange(parents));
  const startChange = () => {
    if (isPinned || !effectiveSelection) return;
    newChange.mutate([effectiveSelection, ...extraParents], {
      onSuccess: () => setMarked(new Set()),
    });
  };
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

  /**
   * Put the typed name on the selected revision.
   *
   * The revision is the selection, so — as with the sidebar's ＋ for a revset
   * — there is nothing to pick here and nothing to type twice. A blank name
   * just closes the strip: `jj bookmark set` with no name is not a command
   * worth sending to find that out.
   *
   * `isPinned` is checked here and not only where ⌘B opens the strip, because
   * the timeline can park the window in the past while the field is still up —
   * every other write in this window guards at the mutate, and so does this.
   */
  const commitBookmarkName = () => {
    const name = (naming ?? "").trim();
    setNaming(undefined);
    if (isPinned || !name || !effectiveSelection) return;
    bookmarkSet.mutate({ name, rev: effectiveSelection });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Text fields stop propagation themselves; this is the window's map.
      const key = event.key.toLowerCase();
      const meta = event.metaKey || event.ctrlKey;

      if (event.key === "Escape") {
        if (lookup) setLookup(undefined);
        else if (showProgress) setShowProgress(false);
        else if (showShortcuts) setShowShortcuts(false);
        else if (showSettings) setShowSettings(false);
        // After the four sheets that can be opened *over* the diff — ⌘/, ⌘G
        // and the rest still work while a diff is up, so the thing on top
        // closes first — and before the pin, which is the window's state
        // rather than something covering it.
        else if (diffPath) setDiffPath(undefined);
        // The naming strip is not a sheet and does not cover anything, so it
        // comes after them — but before the pin, because a half-typed name is
        // the more recent thing the user wants out of.
        else if (naming !== undefined) setNaming(undefined);
        else if (isPinned) pin(undefined);
        return;
      }
      // The Git-to-jj lookup. Available from the first launch to long after the
      // welcome cards are gone — it is the part of the onboarding that keeps
      // earning its key.
      if (meta && key === "g") {
        event.preventDefault();
        setLookup((open) => (open === "git" ? undefined : "git"));
        return;
      }
      // The same sheet, aimed at the revset palette. Not ⌘R: that is "read the
      // repo again", and ⌘K is where every other window in this decade keeps
      // its palette — one letter from the ⌘L that focuses the field it fills.
      if (meta && key === "k" && !event.shiftKey) {
        event.preventDefault();
        setLookup((open) => (open === "revset" ? undefined : "revset"));
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
      // ⌘, is where macOS keeps preferences, and the menu's Settings… item
      // reaches this branch by synthesising the same chord.
      if (meta && key === ",") {
        event.preventDefault();
        setShowSettings((open) => !open);
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
        startChange();
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
      } else if (key === "b") {
        event.preventDefault();
        // Opening the field is not the write, but there is no point offering a
        // name for a revision the window is only reading from the past. Idempotent
        // rather than a toggle: the menu item's accelerator reaches this branch
        // while the field has focus, and it must not wipe what is typed there.
        if (!isPinned && effectiveSelection) setNaming((open) => open ?? "");
      } else if (key === "c" && event.altKey) {
        event.preventDefault();
        copyLastCommand();
      } else if (key >= "1" && key <= "9") {
        event.preventDefault();
        const saved = SAVED_REVSETS[Number(key) - 1];
        if (saved) setRevset(saved.revset);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    showShortcuts,
    lookup,
    showProgress,
    showSettings,
    diffPath,
    naming,
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
    startChange,
    edit,
    abandon,
    fetch,
    push,
    absorb,
    copyLastCommand,
    setRevset,
    selectedRevision,
  ]);

  /**
   * The one thing the window says out loud when a command fails, and the way
   * out of it.
   *
   * A failed mutation holds on to its error until something clears it, so the
   * strip used to sit there until the next command happened to fail. `reset()`
   * on each failed mutation is what actually clears it — a flag over the top
   * would be undone by the next render, because the error is still in the
   * mutation. A failed *read* has no equivalent: resetting the query would
   * re-run the read that just failed and put the same banner straight back, so
   * that one is dismissed by identity. The same `Error` object stays hidden;
   * the next genuine failure is a different object and shows.
   */
  const mutations = [
    newChange,
    edit,
    abandon,
    undo,
    restore,
    fetch,
    push,
    rebase,
    absorb,
    bookmarkSet,
    bookmarkDelete,
  ];
  const failure = mutations.find((mutation) => mutation.error)?.error;
  const error = failure ?? query.error ?? undefined;
  const [dismissed, setDismissed] = useState<unknown>(undefined);
  const dismissError = () => {
    for (const mutation of mutations) if (mutation.error) mutation.reset();
    setDismissed(error);
  };

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

      {error !== undefined && error !== dismissed && (
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
            {messageFor(error)}
          </span>
          <span style={{ flexGrow: 1 }} />
          {/* Same affordance as "Back to now" in the strip above: the row is
              thin, so the way out of it is a word in it, not an icon. */}
          <button
            type="button"
            className="tb-btn"
            style={{ height: 20, fontSize: 11, background: "transparent" }}
            onClick={dismissError}
          >
            {t("Dismiss")}
          </button>
        </div>
      )}

      {naming !== undefined && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: 26,
            padding: "0 14px",
            flexShrink: 0,
            background: "var(--u-bg-raised)",
            fontSize: "var(--u-font-size-small)",
            borderBottom: "1px solid var(--u-line-faint)",
          }}
        >
          {t("Name for a bookmark on the selected change")}
          <input
            className="mono selectable"
            autoFocus
            value={naming}
            spellCheck={false}
            aria-label={t("Name for a bookmark on the selected change")}
            placeholder={t("Name")}
            onChange={(event) => setNaming(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitBookmarkName();
              if (event.key === "Escape") setNaming(undefined);
              // Text entry owns its keys; the window's map must not see them.
              event.stopPropagation();
            }}
            style={{
              flexGrow: 1,
              minWidth: 0,
              background: "transparent",
              border: "none",
              outline: "none",
            }}
          />
          <span className="key">⏎</span>
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
          onOpenSettings={() => setShowSettings(true)}
        />
        <main
          style={
            {
              flexGrow: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              background: "var(--u-bg-window)",
              // The gutter widens with the graph, and the column labels below
              // are a `.row` too — so the variable lives on the ancestor both
              // share, or the header's columns drift off the rows'.
              "--u-row-gutter": `${gutterWidth(layout?.laneCount ?? 0)}px`,
            } as React.CSSProperties
          }
        >
          {/* Column labels for the graph's grid — the board has no such grid. */}
          {view === "graph" && (
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
              {/* Clipped for the same reason the rows' bookmark cell is: this
                  is the column that narrows first. */}
              <div style={{ overflow: "hidden" }}>{t("Bookmarks")}</div>
              <div />
              <div style={{ textAlign: "right" }}>{t("When")}</div>
            </div>
          )}

          {view === "board" && (
            <Board
              onShow={(changeId) => {
                setSelected(changeId);
                setRevset(stackRevset(changeId));
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
              marked={marked}
              onToggleMark={toggleMark}
              onDragStart={startDrag}
              onBookmarkDragStart={startBookmarkDrag}
              onBookmarkDelete={(name) => {
                if (!isPinned) bookmarkDelete.mutate(name);
              }}
              moving={drag ? moving : undefined}
              target={drag?.onto ?? bookmarkDrag?.onto}
              targetLabel={
                bookmarkDrag ? t("{name} here", { name: bookmarkDrag.name }) : undefined
              }
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
        <Inspector
          revision={selectedRevision}
          extraParents={extraParents}
          onStartChange={startChange}
          onOpenSheet={setSheet}
          onOpenDiff={setDiffPath}
        />
      </div>

      <CoachBubble onOpenRosetta={() => setLookup("git")} />

      {showCommands && <CommandPanel onClose={() => setShowCommands(false)} />}
      {lookup && <Lookup focus={lookup} onClose={() => setLookup(undefined)} />}
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
      {/* `!sheet` because the hunk sheet stops every key it does not use, in
          capture: two sheets up at once would leave the diff's ↑/↓ fighting
          the hunk list's. ⌘⇧S over an open diff therefore replaces it, and
          Escape brings the diff back. */}
      {diffPath !== undefined && !sheet && selectedRevision && (
        <DiffSheet
          revision={selectedRevision}
          path={diffPath}
          onClose={() => setDiffPath(undefined)}
        />
      )}
      {showShortcuts && <Shortcuts onClose={() => setShowShortcuts(false)} />}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  );
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
  /*
   * The menu bar is built here rather than in Rust so its labels come from the
   * same catalogue as the window (see `ui/menu.ts`), which means it has to be
   * rebuilt when the language changes. `main.tsx` re-keys this tree on the
   * locale, so a mount effect is already "once per locale" — no subscription,
   * and nothing rebuilt per render.
   */
  useEffect(() => {
    void installAppMenu();
  }, []);

  return (
    <RepoProvider root={root} initialRevset={DEFAULT_REVSET}>
      <Window recents={recents} onOpenRepo={onOpenRepo} />
    </RepoProvider>
  );
}

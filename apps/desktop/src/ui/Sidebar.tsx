import { useState } from "react";
import type { Bookmark } from "@ukemi/domain";
import {
  ALL_REVSET,
  bookmarkRevset,
  BOOKMARKS_REVSET,
  CONFLICTS_REVSET,
  DEFAULT_REVSET,
  EMPTY_REVSET,
  isAliasName,
  stackRevset,
  UNPUSHED_REVSET,
} from "@ukemi/domain";
import { t } from "../i18n/i18n.ts";
import {
  messageFor,
  useAddWorkspace,
  useBookmarks,
  useDeleteRevsetAlias,
  useForgetWorkspace,
  useJjMutation,
  useRepo,
  useRevsetAliases,
  useSaveRevsetAlias,
  useWorkspaces,
} from "../repo.tsx";
import { TransitionStrip } from "./Coach.tsx";
import {
  BookmarkIcon,
  CurrentWorkspaceIcon,
  RevsetIcon,
  SettingsIcon,
  WorkspaceIcon,
} from "./icons.tsx";

/** Saved revsets, bound to ⌘1…⌘7 by position. Handled in `App`'s key map too. */
export const SAVED_REVSETS = [
  { label: "Recent work", revset: DEFAULT_REVSET, key: "⌘1" },
  { label: "Mine, unpushed", revset: UNPUSHED_REVSET, key: "⌘2" },
  { label: "Conflicts", revset: CONFLICTS_REVSET, key: "⌘3" },
  { label: "Current stack", revset: stackRevset("@"), key: "⌘4" },
  { label: "All bookmarks", revset: BOOKMARKS_REVSET, key: "⌘5" },
  { label: "Empty changes", revset: EMPTY_REVSET, key: "⌘6" },
  { label: "Everything", revset: ALL_REVSET, key: "⌘7" },
] as const;

/**
 * The seven built-in revsets, the user's own named ones under them, and the
 * one field that adds to the second list.
 *
 * A row sets the revset to the *name*, not the expression it stands for: the
 * ⌘L field then reads `my-stack`, which is exactly what the same query is
 * called at a terminal. Seeing the expansion is one hover away, and the point
 * of storing these as jj aliases rather than app state is that the short name
 * is real everywhere.
 */
function SavedAliases() {
  const { revset, setRevset } = useRepo();
  const aliases = useRevsetAliases();
  const save = useSaveRevsetAlias();
  const remove = useDeleteRevsetAlias();
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");

  const taken = aliases.data?.some((alias) => alias.name === draft) ?? false;
  const valid = isAliasName(draft);

  const commit = () => {
    if (!valid) return;
    // The expression saved is whatever the window is showing: clicking ＋ can
    // only mean "this one", so there is nothing to pick and nothing to type
    // twice.
    save.mutate({ name: draft, revset });
    setDraft("");
    setNaming(false);
  };

  return (
    <>
      <div className="side-head" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {t("Saved revsets")}
        <span style={{ flexGrow: 1 }} />
        <button
          type="button"
          className="tb-btn"
          style={{ height: 18, fontSize: 10.5, padding: "0 6px" }}
          aria-pressed={naming}
          onClick={() => setNaming((open) => !open)}
          title={t("Name the current revset")}
          aria-label={t("Name the current revset")}
        >
          ＋
        </button>
      </div>

      {naming && (
        <div className="side-item" style={{ gap: 6 }}>
          <RevsetIcon />
          <input
            className="mono selectable"
            autoFocus
            value={draft}
            spellCheck={false}
            aria-label={t("Name for this revset")}
            aria-invalid={draft.length > 0 && !valid}
            placeholder={t("Name")}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
              if (event.key === "Escape") {
                setDraft("");
                setNaming(false);
              }
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
      {/* Said only while it is wrong, and it says the rule rather than that a
          rule was broken. The name becomes a bare symbol inside a revset, so
          the narrow shape is `isAliasName`'s doing, not a UI preference. */}
      {naming && draft.length > 0 && !valid && (
        <div className="ter" style={{ padding: "0 8px 2px", fontSize: 11 }}>
          {t("A letter, then letters, digits, - or _.")}
        </div>
      )}
      {naming && valid && taken && (
        <div className="ter" style={{ padding: "0 8px 2px", fontSize: 11 }}>
          {t("Replaces the revset {name} already stands for.", { name: draft })}
        </div>
      )}

      {SAVED_REVSETS.map((saved) => (
        <button
          type="button"
          className="side-item"
          key={saved.label}
          aria-current={revset === saved.revset}
          onClick={() => setRevset(saved.revset)}
        >
          <RevsetIcon />
          <span style={{ flexGrow: 1 }}>{t(saved.label)}</span>
          <span className="key">{saved.key}</span>
        </button>
      ))}

      {aliases.data?.map((alias) => (
        <div
          className="side-item"
          key={alias.name}
          aria-current={revset === alias.name}
          title={alias.revset}
        >
          <RevsetIcon />
          <button
            type="button"
            onClick={() => setRevset(alias.name)}
            style={{
              flexGrow: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textAlign: "left",
            }}
          >
            {alias.name}
          </button>
          {/* No confirmation sheet: the row is one line of repo config, the
              expression it removes is in the tooltip beside it, and `jj config
              set` puts it back. ponytail: if a longer expression starts being
              hard to retype, undo belongs here rather than a dialog. */}
          <button
            type="button"
            className="ter"
            onClick={() => remove.mutate(alias.name)}
            title={t("Forget {name}", { name: alias.name })}
            aria-label={t("Forget {name}", { name: alias.name })}
            style={{ flexShrink: 0, padding: "0 2px", fontSize: 13 }}
          >
            ×
          </button>
        </div>
      ))}
    </>
  );
}

/** Local rows only; remote-tracking rows fold into their local row's counts. */
function localBookmarks(bookmarks: readonly Bookmark[]): Bookmark[] {
  const remotes = bookmarks.filter((bookmark) => bookmark.remote !== undefined);
  return bookmarks
    .filter((bookmark) => bookmark.remote === undefined)
    .map((local) => {
      const tracked = remotes.find(
        (remote) => remote.name === local.name && remote.ahead !== undefined,
      );
      return tracked ? { ...local, ahead: tracked.ahead, behind: tracked.behind } : local;
    });
}

/**
 * Remote rows nobody tracks — a teammate's work, as a fetch leaves it.
 *
 * jj's `git.auto-local-bookmark` defaults to off, so a fetch imports the ref
 * without minting a local name for it: the bookmark is in the repo but no
 * revset the sidebar offers can see it.
 *
 * Absent counts is the whole test, and it is exact rather than a heuristic:
 * `tracking_ahead_count` answers only for a tracked ref, so the template emits
 * null for precisely the untracked ones. That also keeps the colocated `@git`
 * rows out, since those are tracked by construction, and it keeps a bookmark
 * deleted locally but still tracked out, since its counts are still numbers.
 *
 * Deliberately *not* also filtered on "no local row of that name": a local
 * `foo` and an untracked `foo@origin` can coexist — a name pushed by someone
 * else, or a remote untracked by hand — and that is exactly the case where the
 * two want connecting.
 */
function untrackedRemotes(
  bookmarks: readonly Bookmark[],
): { name: string; remote: string }[] {
  return bookmarks.flatMap((bookmark) =>
    bookmark.remote !== undefined && bookmark.ahead === undefined
      ? [{ name: bookmark.name, remote: bookmark.remote }]
      : [],
  );
}

export function Sidebar({
  view,
  onToggleBoard,
  onOpenProgress,
  onOpenSettings,
}: {
  view: "graph" | "board";
  onToggleBoard(): void;
  onOpenProgress(): void;
  onOpenSettings(): void;
}) {
  const { revset, setRevset, isPinned } = useRepo();
  const bookmarks = useBookmarks();
  const workspaces = useWorkspaces();
  const track = useJjMutation((port, args: { name: string; remote: string }) =>
    port.bookmarkTrack(args.name, args.remote),
  );
  const addWorkspace = useAddWorkspace();
  const forget = useForgetWorkspace();

  return (
    <nav
      className="u-scroll"
      style={{
        width: 232,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        padding: "6px 10px",
        background: "var(--u-bg-sidebar)",
        borderRight: "1px solid var(--u-line)",
      }}
    >
      <div className="side-head">{t("Bookmarks")}</div>
      {bookmarks.data?.length === 0 && (
        <div className="sec" style={{ padding: "0 8px", fontSize: 12 }}>
          {t("None yet.")}
        </div>
      )}
      {bookmarks.data &&
        localBookmarks(bookmarks.data).map((bookmark) => {
          const target = bookmarkRevset(bookmark.name);
          return (
            <button
              type="button"
              className="side-item"
              key={bookmark.name}
              aria-current={revset === target}
              onClick={() => setRevset(target)}
            >
              <BookmarkIcon />
              <span
                style={{
                  flexGrow: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {bookmark.name}
              </span>
              {bookmark.hasConflict && (
                <span className="pill" data-kind="conflict">
                  ⚠
                </span>
              )}
              {bookmark.ahead !== undefined && bookmark.ahead > 0 && (
                <span className="pill">↑{bookmark.ahead}</span>
              )}
              {bookmark.behind !== undefined && bookmark.behind > 0 && (
                <span className="pill">↓{bookmark.behind}</span>
              )}
              {bookmark.ahead === undefined && (
                <span className="ter" style={{ fontSize: 11 }}>
                  {t("local")}
                </span>
              )}
            </button>
          );
        })}

      {/* Under the same head, but muted and named the way jj names them: these
          are not bookmarks of this repo yet, and the whole row is the verb.
          A failure reports under the list rather than in `App`'s strip: that
          strip belongs to the mutations `App` owns, and a row that simply did
          not move is no explanation at all. */}
      {bookmarks.data &&
        untrackedRemotes(bookmarks.data).map((remote) => (
          <button
            type="button"
            className="side-item"
            key={`${remote.name}@${remote.remote}`}
            disabled={isPinned || track.isPending}
            onClick={() => {
              if (!isPinned) track.mutate(remote);
            }}
            title={
              isPinned
                ? t("The window is parked on a past operation. Return to now to make changes.")
                : t("Track {name} to get a local bookmark for it", {
                    name: `${remote.name}@${remote.remote}`,
                  })
            }
          >
            <BookmarkIcon />
            <span
              className="ter"
              style={{
                flexGrow: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                textAlign: "left",
              }}
            >
              {remote.name}@{remote.remote}
            </span>
            <span className="ter" style={{ fontSize: 11 }}>
              {t("Track")}
            </span>
          </button>
        ))}

      {track.error && (
        <div
          role="alert"
          className="mono selectable"
          style={{
            fontSize: 11,
            color: "var(--u-conflict)",
            whiteSpace: "pre-wrap",
            padding: "2px 8px",
          }}
        >
          {messageFor(track.error)}
        </div>
      )}

      <div className="side-head" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {t("Workspaces")}
        <span style={{ flexGrow: 1 }} />
        <button
          type="button"
          className="tb-btn"
          style={{ height: 18, fontSize: 10.5, padding: "0 6px" }}
          onClick={addWorkspace.pickAndAdd}
          title={t("New workspace")}
          aria-label={t("New workspace")}
        >
          ＋
        </button>
        <button
          type="button"
          className="tb-btn"
          style={{ height: 18, fontSize: 10.5, padding: "0 6px" }}
          aria-pressed={view === "board"}
          {...(view === "board" ? { "data-variant": "primary" } : {})}
          onClick={onToggleBoard}
          title={t("Workspace board (⌘⇧W)")}
        >
          {t("Board")}
        </button>
      </div>
      {workspaces.data?.map((workspace, index) => (
        <div
          className="side-item"
          key={workspace.name}
          title={t("Working copy of {name}", { name: workspace.name })}
        >
          {index === 0 ? <CurrentWorkspaceIcon /> : <WorkspaceIcon />}
          <button
            type="button"
            onClick={() => setRevset(workspace.changeId)}
            style={{
              flexGrow: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textAlign: "left",
            }}
          >
            {workspace.name}
          </button>
          <span className="mono ter" style={{ fontSize: 11 }}>
            {workspace.changeId.slice(0, 4)}
          </span>
          {/* Not offered for the first row: that is this window's own working
              copy, and forgetting it would leave the app looking at a
              workspace the repo no longer has. No confirmation on the rest —
              `jj workspace forget` is an operation like any other, so ⌘Z puts
              it back, and the folder on disk is untouched either way. */}
          {index > 0 && (
            <button
              type="button"
              className="ter"
              onClick={() => forget.mutate(workspace.name)}
              title={t("Forget {name}", { name: workspace.name })}
              aria-label={t("Forget {name}", { name: workspace.name })}
              style={{ flexShrink: 0, padding: "0 2px", fontSize: 13 }}
            >
              ×
            </button>
          )}
        </div>
      ))}
      {(addWorkspace.error ?? forget.error) && (
        <div
          role="alert"
          className="mono selectable"
          style={{
            fontSize: 11,
            color: "var(--u-conflict)",
            whiteSpace: "pre-wrap",
            padding: "2px 8px",
          }}
        >
          {messageFor(addWorkspace.error ?? forget.error)}
        </div>
      )}

      <SavedAliases />

      {/* The theme and language pickers used to sit under this strip. They are
          the user's settings, not this repository's, so they moved behind ⌘,
          where macOS keeps settings.

          This one row is what they left behind, and it is not a hedge: eleven
          rows of preferences in the primary navigation was the problem, a
          pointer to them is not. Moving the pickers out with nothing in their
          place made the themes unfindable — and a theme nobody can select is a
          theme nobody has checked, which is the whole argument for the class
          contract in `themes/contract.css`. It reads the way the strip below
          it does, label plus its key, so the sidebar teaches the shortcut
          rather than replacing it. */}
      <span style={{ flexGrow: 1, minHeight: 12 }} />
      <button type="button" className="side-item" onClick={onOpenSettings}>
        <SettingsIcon />
        <span style={{ flexGrow: 1 }}>{t("Settings")}</span>
        <span className="key">⌘,</span>
      </button>
      <TransitionStrip onOpen={onOpenProgress} />
    </nav>
  );
}

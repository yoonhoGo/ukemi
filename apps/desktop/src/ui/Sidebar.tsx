import type { Bookmark } from "@ukemi/domain";
import { bookmarkRevset, CONFLICTS_REVSET, DEFAULT_REVSET, UNPUSHED_REVSET } from "@ukemi/domain";
import { t } from "../i18n/i18n.ts";
import { useBookmarks, useRepo, useWorkspaces } from "../repo.tsx";
import { TransitionStrip } from "./Coach.tsx";
import { BookmarkIcon, CurrentWorkspaceIcon, RevsetIcon, WorkspaceIcon } from "./icons.tsx";
import { LanguagePicker } from "./LanguagePicker.tsx";
import { ThemePicker } from "./ThemePicker.tsx";

/** Saved revsets, bound to ⌘1…⌘3. Handled in `App`'s key map too. */
export const SAVED_REVSETS = [
  { label: "Recent work", revset: DEFAULT_REVSET, key: "⌘1" },
  { label: "Mine, unpushed", revset: UNPUSHED_REVSET, key: "⌘2" },
  { label: "Conflicts", revset: CONFLICTS_REVSET, key: "⌘3" },
] as const;

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

export function Sidebar({
  view,
  onToggleBoard,
  onOpenProgress,
}: {
  view: "graph" | "board";
  onToggleBoard(): void;
  onOpenProgress(): void;
}) {
  const { revset, setRevset } = useRepo();
  const bookmarks = useBookmarks();
  const workspaces = useWorkspaces();

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

      <div className="side-head" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {t("Workspaces")}
        <span style={{ flexGrow: 1 }} />
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
        <button
          type="button"
          className="side-item"
          key={workspace.name}
          onClick={() => setRevset(workspace.changeId)}
          title={t("Working copy of {name}", { name: workspace.name })}
        >
          {index === 0 ? <CurrentWorkspaceIcon /> : <WorkspaceIcon />}
          <span style={{ flexGrow: 1 }}>{workspace.name}</span>
          <span className="mono ter" style={{ fontSize: 11 }}>
            {workspace.changeId.slice(0, 4)}
          </span>
        </button>
      ))}

      <div className="side-head">{t("Saved revsets")}</div>
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

      <span style={{ flexGrow: 1, minHeight: 12 }} />
      <TransitionStrip onOpen={onOpenProgress} />
      <ThemePicker />
      <LanguagePicker />
    </nav>
  );
}

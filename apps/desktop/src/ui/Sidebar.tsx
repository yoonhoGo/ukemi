import { useState, type ReactNode } from "react";
import type { Bookmark } from "@ukemi/domain";
import {
  ALL_REVSET,
  bookmarkRevset,
  BOOKMARKS_REVSET,
  CONFLICTS_REVSET,
  DEFAULT_REVSET,
  EMPTY_REVSET,
  isAliasName,
  REACHABLE_REVSET,
  stackRevset,
  tagRevset,
  TAGS_REVSET,
  UNPUSHED_REVSET,
  WORKSPACES_REVSET,
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
  useTags,
  useTrunkBookmark,
  useWorkspaces,
} from "../repo.tsx";
import { TransitionStrip } from "./Coach.tsx";
import {
  BookmarkIcon,
  BranchIcon,
  ChevronIcon,
  CurrentWorkspaceIcon,
  FolderIcon,
  PencilIcon,
  RevsetIcon,
  SettingsIcon,
  StarIcon,
  TagIcon,
  WorkspaceIcon,
} from "./icons.tsx";
import {
  localBookmarks,
  orderRows,
  reorder,
  setCollapsed,
  setRevsetOrder,
  sortBookmarks,
  sortTags,
  useSidebarState,
} from "./sidebar-state.ts";

/**
 * Built-in revsets, bound to ⌘1…⌘8 by position *in this list*. Handled in
 * `App`'s key map and the View menu too. This order is the order the rows
 * appear down the sidebar, so reading the digits top to bottom counts 1…8:
 * a row's place in the list *is* its chord, and moving a row here moves both.
 */
export const SAVED_REVSETS = [
  { label: "Recent work", revset: DEFAULT_REVSET, key: "⌘1" },
  { label: "Mine, unpushed", revset: UNPUSHED_REVSET, key: "⌘2" },
  { label: "Conflicts", revset: CONFLICTS_REVSET, key: "⌘3" },
  { label: "Current stack", revset: stackRevset("@"), key: "⌘4" },
  { label: "Empty changes", revset: EMPTY_REVSET, key: "⌘5" },
  { label: "All bookmarks", revset: BOOKMARKS_REVSET, key: "⌘6" },
  { label: "Everything", revset: ALL_REVSET, key: "⌘7" },
  // What a Git client's "all branches" view draws. Offered under a Git word
  // because that is the picture a Fork or Tower user is looking for on day one.
  { label: "All branches", revset: REACHABLE_REVSET, key: "⌘8" },
] as const;

type Preset = (typeof SAVED_REVSETS)[number];

/** The built-in with this label; the labels are the list's own identifiers. */
function preset(label: Preset["label"]): Preset {
  return SAVED_REVSETS.find((saved) => saved.label === label)!;
}

/**
 * A section is a kind of revset; its rows are members of that kind.
 *
 * The heading does one thing, the way a macOS sidebar group header does: the
 * whole of it — chevron, icon, name — folds the section. Native `<details>`,
 * so the fold and its keyboard handling are the browser's and only *which*
 * sections are folded is ours. The kind's own revset is the first row under
 * it, not the heading, so a heading is never both a fold and a filter. The
 * action buttons on the right swallow their click so they do not fold.
 */
function Section({
  id,
  title,
  icon,
  actions,
  children,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { collapsed } = useSidebarState();
  return (
    <details
      open={!collapsed.includes(id)}
      onToggle={(event) => setCollapsed(id, !event.currentTarget.open)}
    >
      <summary className="side-head" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span className="chev" aria-hidden>
          <ChevronIcon />
        </span>
        {icon}
        <span style={{ flexGrow: 1, minWidth: 0, whiteSpace: "nowrap" }}>{title}</span>
        {/* One row, always: the buttons keep their width and the title gives
            way, or a narrow heading stacks them and the fold arrow drifts. */}
        {actions && (
          <span
            onClick={(event) => event.preventDefault()}
            style={{ display: "flex", gap: 4, flexShrink: 0 }}
          >
            {actions}
          </span>
        )}
      </summary>
      {children}
    </details>
  );
}

/** A row that applies a revset: label, the key if it has one, and the query. */
function RevsetRow({
  label,
  revset: target,
  shortcut,
}: {
  label: string;
  revset: string;
  shortcut?: string;
}) {
  const { revset, setRevset } = useRepo();
  return (
    <button
      type="button"
      className="side-item"
      aria-current={revset === target}
      title={t("Show {revset}", { revset: target })}
      onClick={() => setRevset(target)}
    >
      <RevsetIcon />
      <span style={{ flexGrow: 1 }}>{label}</span>
      {shortcut && <span className="key">{shortcut}</span>}
    </button>
  );
}

/** One built-in row, looked up by its label. */
function PresetRow({ label }: { label: Preset["label"] }) {
  const saved = preset(label);
  return <RevsetRow label={t(saved.label)} revset={saved.revset} shortcut={saved.key} />;
}

/**
 * The user's own named revsets, in the order they left them, and the field
 * that adds to the list.
 *
 * A row sets the revset to the *name*, not the expression it stands for: the
 * ⌘L field then reads `my-stack`, which is exactly what the same query is
 * called at a terminal. Seeing the expansion is one hover away, and the point
 * of storing these as jj aliases rather than app state is that the short name
 * is real everywhere.
 */
function MyRevsets() {
  const { revset, setRevset } = useRepo();
  const aliases = useRevsetAliases();
  const save = useSaveRevsetAlias();
  const remove = useDeleteRevsetAlias();
  const { revsetOrder } = useSidebarState();
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [dragging, setDragging] = useState<string | undefined>(undefined);

  const taken = aliases.data?.some((alias) => alias.name === draft) ?? false;
  const valid = isAliasName(draft);
  const rows = orderRows(aliases.data ?? [], (alias) => alias.name, revsetOrder);

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
    <Section
      id="mine"
      title={t("My revsets")}
      icon={<StarIcon />}
      actions={
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
      }
    >
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
        <div className="ter" style={{ padding: "0 8px 2px 28px", fontSize: 11 }}>
          {t("A letter, then letters, digits, - or _.")}
        </div>
      )}
      {naming && valid && taken && (
        <div className="ter" style={{ padding: "0 8px 2px 28px", fontSize: 11 }}>
          {t("Replaces the revset {name} already stands for.", { name: draft })}
        </div>
      )}
      {!naming && rows.length === 0 && (
        <div className="sec" style={{ padding: "0 8px 0 28px", fontSize: 12 }}>
          {t("None yet.")}
        </div>
      )}

      {/* HTML5 drag, which needs `dragDropEnabled: false` on the Tauri window
          (see tauri.conf.json) or the shell eats the events as a file drop. The
          dropped row takes the target's place; the stored order is the whole
          list, so a new alias lands at the end rather than anywhere. Only this
          list is hand-ordered: the other sections sort by a rule. */}
      {rows.map((alias) => (
        <div
          className="side-item"
          key={alias.name}
          aria-current={revset === alias.name}
          title={alias.revset}
          draggable
          onDragStart={(event) => {
            setDragging(alias.name);
            event.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => setDragging(undefined)}
          onDragOver={(event) => {
            if (dragging !== undefined && dragging !== alias.name) event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (dragging === undefined) return;
            setRevsetOrder(
              reorder(
                rows.map((each) => each.name),
                dragging,
                alias.name,
              ),
            );
            setDragging(undefined);
          }}
          style={{ cursor: "grab", ...(dragging === alias.name ? { opacity: 0.4 } : {}) }}
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
    </Section>
  );
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
 * Filtered on target as well, because a local `foo` and an untracked
 * `foo@origin` can coexist and the two cases read differently: at the same
 * target they are one thing said twice, and the local row above already stands
 * for it, so a second row only asks the user to reconcile what agrees. At
 * different targets — a name pushed by someone else, or a remote untracked by
 * hand — the two really are apart, and that is the row worth offering.
 */
function untrackedRemotes(
  bookmarks: readonly Bookmark[],
): { name: string; remote: string }[] {
  const locals = bookmarks.filter((bookmark) => bookmark.remote === undefined);
  return bookmarks.flatMap((bookmark) =>
    bookmark.remote !== undefined &&
    bookmark.ahead === undefined &&
    !locals.some(
      (local) => local.name === bookmark.name && local.target === bookmark.target,
    )
      ? [{ name: bookmark.name, remote: bookmark.remote }]
      : [],
  );
}

/**
 * The sidebar: a taxonomy of revsets. Each section is one kind — the changes
 * you are working on, the bookmarks, the tags, the workspaces, the repository
 * as a whole, and the queries you named yourself — and every row in it is a
 * member of that kind. The kind's own revset — "All bookmarks" under Bookmarks,
 * "Everything" under Repository — is the first row of its section, so the
 * ⌘-digits on the rows count 1…8 straight down the sidebar.
 */
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
  const trunk = useTrunkBookmark();
  const tags = useTags();
  const workspaces = useWorkspaces();
  const track = useJjMutation((port, args: { name: string; remote: string }) =>
    port.bookmarkTrack(args.name, args.remote),
  );
  const pushOne = useJjMutation((port, name: string) => port.push({ bookmarks: [name] }));
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
      <Section id="work" title={t("Work")} icon={<PencilIcon />}>
        <PresetRow label="Recent work" />
        <PresetRow label="Mine, unpushed" />
        <PresetRow label="Conflicts" />
        <PresetRow label="Current stack" />
        <PresetRow label="Empty changes" />
      </Section>

      {/* One icon for the section, not one per row: a column of the same glyph
          repeated says nothing the heading has not, and it was the only thing
          between the row's left edge and the name. */}
      <Section id="bookmarks" title={t("Bookmarks")} icon={<BookmarkIcon />}>
        <PresetRow label="All bookmarks" />
        {bookmarks.data?.length === 0 && (
          <div className="sec" style={{ padding: "0 8px 0 28px", fontSize: 12 }}>
            {t("None yet.")}
          </div>
        )}
        {bookmarks.data &&
          sortBookmarks(localBookmarks(bookmarks.data), trunk).map((bookmark) => {
            // The bookmark *and* everything under it: one revision is what the
            // pill on the graph already tells you, the line down to root is
            // what a sidebar click is for.
            const target = `::${bookmarkRevset(bookmark.name)}`;
            return (
              /* A div rather than a button, because the row now holds one: the
                 name applies the revset, and the trailing verb pushes. Same
                 shape as the workspace and saved-revset rows. */
              <div className="side-item" key={bookmark.name} aria-current={revset === target}>
                <button
                  type="button"
                  onClick={() => setRevset(target)}
                  style={{
                    flexGrow: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    textAlign: "left",
                  }}
                >
                  {bookmark.name}
                </button>
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
                  /* No remote has this name yet, so the state and the way out
                     of it are the same word: the row said "local" here, which
                     named the state and offered nothing. The toolbar's Push
                     covers these too — this is the one that pushes *this* name
                     and nothing else.

                     `nowrap` because a line breaks between Hangul syllables:
                     under a long bookmark name the label would otherwise stack
                     one syllable per line and push the row taller. */
                  <button
                    type="button"
                    className="ter"
                    disabled={isPinned || pushOne.isPending}
                    onClick={() => pushOne.mutate(bookmark.name)}
                    title={
                      isPinned
                        ? t(
                            "The window is parked on a past operation. Return to now to make changes.",
                          )
                        : t("Push {name} to create it on the remote", { name: bookmark.name })
                    }
                    style={{
                      fontSize: 11,
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                      padding: "0 2px",
                    }}
                  >
                    {t("Push")}
                  </button>
                )}
              </div>
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
              <span
                className="ter"
                style={{ fontSize: 11, whiteSpace: "nowrap", flexShrink: 0 }}
              >
                {t("Track")}
              </span>
            </button>
          ))}

        {(track.error ?? pushOne.error) && (
          <div
            role="alert"
            className="mono selectable"
            style={{
              fontSize: 11,
              color: "var(--u-conflict)",
              whiteSpace: "pre-wrap",
              padding: "2px 8px 2px 28px",
            }}
          >
            {messageFor(track.error ?? pushOne.error)}
          </div>
        )}
      </Section>

      {/* Only when there are some: most jj repos have none, and a heading whose
          revset is empty is a dead button. Newest first — a tag's name is its
          place in time, which is the one thing a bookmark name is not. */}
      {(tags.data?.length ?? 0) > 0 && (
        <Section id="tags" title={t("Tags")} icon={<TagIcon />}>
          <RevsetRow label={t("All tags")} revset={TAGS_REVSET} />
          {sortTags(tags.data ?? []).map((tag) => {
            const target = tagRevset(tag.name);
            return (
              <button
                type="button"
                className="side-item"
                key={tag.name}
                aria-current={revset === target}
                onClick={() => setRevset(target)}
              >
                <span
                  style={{
                    flexGrow: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tag.name}
                </span>
                {tag.target && (
                  <span className="mono ter" style={{ fontSize: 11 }}>
                    {tag.target.slice(0, 4)}
                  </span>
                )}
              </button>
            );
          })}
        </Section>
      )}

      <Section
        id="workspaces"
        title={t("Workspaces")}
        icon={<FolderIcon />}
        actions={
          <>
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
          </>
        }
      >
        <RevsetRow label={t("All workspaces")} revset={WORKSPACES_REVSET} />
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
              padding: "2px 8px 2px 28px",
            }}
          >
            {messageFor(addWorkspace.error ?? forget.error)}
          </div>
        )}
      </Section>

      <Section id="repository" title={t("Repository")} icon={<BranchIcon />}>
        <PresetRow label="Everything" />
        <PresetRow label="All branches" />
      </Section>

      <MyRevsets />

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

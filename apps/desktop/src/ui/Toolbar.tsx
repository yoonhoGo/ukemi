import { useEffect, useRef, useState } from "react";
import { t } from "../i18n/i18n.ts";
import { useJjMutation, useRepo } from "../repo.tsx";
import { FetchIcon, FilterIcon, PlusIcon, PushIcon } from "./icons.tsx";

/**
 * The revset field.
 *
 * Shows the revset verbatim, because the revset *is* the query language and
 * hiding it would make the app a worse teacher than the CLI. Edits apply on
 * Enter, not per keystroke: a half-typed revset is a syntax error, and running
 * one on every character would flood the window with red.
 */
function RevsetField() {
  const { revset, setRevset } = useRepo();
  const [draft, setDraft] = useState(revset);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(revset), [revset]);

  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "l" && event.metaKey) {
        event.preventDefault();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", focus);
    return () => window.removeEventListener("keydown", focus);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        // Grows into whatever the toolbar's centre has left rather than
        // truncating the default revset at a fixed 460px. The floor is what
        // still fits beside the repo switcher and the action cluster at the
        // 900px minimum window width declared in tauri.conf.json.
        flexGrow: 1,
        minWidth: 200,
        maxWidth: 520,
        height: 28,
        padding: "0 10px",
        borderRadius: 7,
        background: "var(--u-bg-raised)",
        border: "1px solid var(--u-line-strong)",
        boxShadow: "inset 0 1px 1px rgba(0,0,0,0.04)",
      }}
    >
      <FilterIcon />
      <input
        ref={input}
        className="mono selectable"
        value={draft}
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") setRevset(draft);
          if (event.key === "Escape") {
            setDraft(revset);
            event.currentTarget.blur();
          }
          // Text entry owns its keys; the window's map must not see them.
          event.stopPropagation();
        }}
        aria-label={t("Revset")}
        style={{
          flexGrow: 1,
          minWidth: 0,
          background: "transparent",
          outline: "none",
        }}
      />
      <span className="key">⌘L</span>
    </div>
  );
}

/**
 * The last two segments of a path, the way a Mac app's title bar abbreviates
 * one.
 *
 * The left-truncating `direction: "rtl"` this replaces put the leading `/` at
 * the visual *end* — a slash is bidi-neutral, so it takes the direction of the
 * run around it — and `/Users/me/ukemi` rendered as `Users/me/ukemi/`. Showing
 * the tail outright needs no bidi trick at all; the absolute path stays one
 * hover away in `title`.
 */
function abbreviatePath(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments.length > 2 ? `…/${segments.slice(-2).join("/")}` : path;
}

/**
 * The repository switcher.
 *
 * The name of the open repo *is* the control: a lone glyph here read as a
 * sidebar toggle — a rounded rect with a divider is exactly that icon — and a
 * folder picker was the only way between projects, which made switching cost a
 * dialog every time. The recents come from the same list that decides which
 * repo the app reopens at launch, so the menu can only offer repos that were
 * actually opened.
 */
function RepoSwitcher({
  root,
  recents,
  onOpenRepo,
}: {
  root: string;
  recents: readonly string[];
  onOpenRepo(path?: string): void;
}) {
  const [open, setOpen] = useState(false);
  const name = root.split("/").filter(Boolean).pop() ?? root;
  const others = recents.filter((path) => path !== root);

  return (
    <div
      style={{ position: "relative", minWidth: 0 }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        setOpen(false);
        // The window's map would read this Escape as "back to now".
        event.stopPropagation();
      }}
    >
      <button
        type="button"
        className="tb-btn"
        style={{ height: "auto", minWidth: 0, padding: "3px 8px" }}
        onClick={() => setOpen((shown) => !shown)}
        aria-expanded={open}
        title={t("Switch repository (⌘O opens the picker)")}
      >
        <span
          style={{ display: "flex", flexDirection: "column", minWidth: 0, textAlign: "left" }}
        >
          <span style={{ fontSize: 13, fontWeight: 600 }}>{name}</span>
          <span
            className="sec"
            title={root}
            style={{
              fontSize: 11,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {abbreviatePath(root)}
          </span>
        </span>
        <span className="key">⌘O</span>
      </button>

      {open && (
        <>
          {/* An invisible sheet is what closes the menu on an outside click,
              which costs less than a document listener and cannot outlive it. */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              zIndex: 41,
              minWidth: 260,
              maxWidth: 420,
              padding: 4,
              borderRadius: "var(--u-radius-lg)",
              background: "var(--u-bg-raised)",
              border: "1px solid var(--u-line-strong)",
              boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
            }}
          >
            {others.length > 0 && <div className="side-head">{t("Recent")}</div>}
            {others.map((path) => (
              <button
                type="button"
                role="menuitem"
                className="side-item"
                key={path}
                title={path}
                onClick={() => {
                  setOpen(false);
                  onOpenRepo(path);
                }}
              >
                <span style={{ flexShrink: 0 }}>{path.split("/").filter(Boolean).pop()}</span>
                <span
                  className="ter"
                  style={{
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: "var(--u-font-size-small)",
                  }}
                >
                  {abbreviatePath(path)}
                </span>
              </button>
            ))}
            <button
              type="button"
              role="menuitem"
              className="side-item"
              onClick={() => {
                setOpen(false);
                onOpenRepo();
              }}
            >
              <span style={{ flexGrow: 1 }}>{t("Choose another folder…")}</span>
              <span className="key">⌘O</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function Toolbar({
  root,
  recents,
  onOpenRepo,
  onShowShortcuts,
}: {
  root: string;
  recents: readonly string[];
  onOpenRepo(path?: string): void;
  onShowShortcuts(): void;
}) {
  const { port, isPinned } = useRepo();
  const fetch = useJjMutation((p) => p.fetch());
  const push = useJjMutation((p) => p.push());
  const newChange = useJjMutation((p) => p.newChange(["@"]));
  // The bundled binary is the one the templates were written against, so the
  // repo path is the only ambiguity worth showing here.
  void port;

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        height: 52,
        padding: "0 12px 0 14px",
        gap: 10,
        flexShrink: 0,
        background: "var(--u-bg-toolbar)",
        borderBottom: "1px solid var(--u-line-strong)",
      }}
      // Lets the window be dragged by its toolbar, as a native one is.
      data-tauri-drag-region
    >
      {/* Room for the traffic lights, which the overlay title bar draws over us. */}
      <div style={{ width: 68, flexShrink: 0 }} />
      <RepoSwitcher root={root} recents={recents} onOpenRepo={onOpenRepo} />
      <div style={{ flexGrow: 1, minWidth: 0, display: "flex", justifyContent: "center" }}>
        <RevsetField />
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button
          type="button"
          className="tb-btn"
          onClick={() => fetch.mutate(undefined)}
          disabled={fetch.isPending || isPinned}
        >
          <FetchIcon />
          {fetch.isPending ? t("Fetching…") : t("Fetch")} <span className="key">⇧⌘F</span>
        </button>
        <button
          type="button"
          className="tb-btn"
          onClick={() => push.mutate(undefined)}
          disabled={push.isPending || isPinned}
        >
          <PushIcon />
          {push.isPending ? t("Pushing…") : t("Push")} <span className="key">⇧⌘P</span>
        </button>
        <button
          type="button"
          className="tb-btn"
          data-variant="primary"
          onClick={() => newChange.mutate(undefined)}
          disabled={newChange.isPending || isPinned}
        >
          <PlusIcon />
          {t("New")} <span className="key">⌘N</span>
        </button>
        <button
          type="button"
          className="tb-btn"
          onClick={onShowShortcuts}
          title={t("All shortcuts (⌘/)")}
          // The label is a key badge, so without this the button has no
          // accessible name at all.
          aria-label={t("All shortcuts (⌘/)")}
        >
          <span className="key">⌘/</span>
        </button>
      </div>
    </header>
  );
}

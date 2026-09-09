import { useEffect, useRef, useState } from "react";
import { useJjMutation, useRepo } from "../repo.tsx";
import { FetchIcon, PlusIcon, PushIcon, RepoIcon, SearchIcon } from "./icons.tsx";

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
        width: 460,
        height: 28,
        padding: "0 10px",
        borderRadius: 7,
        background: "var(--u-bg-raised)",
        border: "1px solid var(--u-line-strong)",
        boxShadow: "inset 0 1px 1px rgba(0,0,0,0.04)",
      }}
    >
      <SearchIcon />
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
        aria-label="Revset"
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

export function Toolbar({
  root,
  onOpenRepo,
  onShowShortcuts,
}: {
  root: string;
  onOpenRepo(): void;
  onShowShortcuts(): void;
}) {
  const { port, isPinned } = useRepo();
  const fetch = useJjMutation((p) => p.fetch());
  const push = useJjMutation((p) => p.push());
  const newChange = useJjMutation((p) => p.newChange(["@"]));
  const name = root.split("/").filter(Boolean).pop() ?? root;
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
      <button
        type="button"
        className="tb-btn"
        style={{ background: "transparent", padding: "0 6px" }}
        onClick={onOpenRepo}
        title="Open another repository (⌘O)"
      >
        <RepoIcon />
      </button>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{name}</div>
        <div
          className="sec"
          style={{
            fontSize: 11,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            direction: "rtl",
            textAlign: "left",
          }}
          title={root}
        >
          {root}
        </div>
      </div>
      <div style={{ flexGrow: 1, display: "flex", justifyContent: "center" }}>
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
          {fetch.isPending ? "Fetching…" : "Fetch"} <span className="key">⇧⌘F</span>
        </button>
        <button
          type="button"
          className="tb-btn"
          onClick={() => push.mutate(undefined)}
          disabled={push.isPending || isPinned}
        >
          <PushIcon />
          {push.isPending ? "Pushing…" : "Push"} <span className="key">⇧⌘P</span>
        </button>
        <button
          type="button"
          className="tb-btn"
          data-variant="primary"
          onClick={() => newChange.mutate(undefined)}
          disabled={newChange.isPending || isPinned}
        >
          <PlusIcon />
          New <span className="key">⌘N</span>
        </button>
        <button
          type="button"
          className="tb-btn"
          onClick={onShowShortcuts}
          title="All shortcuts (⌘/)"
        >
          <span className="key">⌘/</span>
        </button>
      </div>
    </header>
  );
}

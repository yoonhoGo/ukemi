import { useMemo, useRef, useState, type ReactNode } from "react";
import { t, tParts } from "../i18n/i18n.ts";
import {
  useBookmarks,
  useRepo,
  useRevsetAliases,
  useRevsetFunctions,
  useWorkspaces,
} from "../repo.tsx";
import { useModal } from "./modal.ts";
import {
  insertIntoDraft,
  KIND_LABELS,
  rankRevsetRows,
  revsetRows,
  type RevsetRow,
} from "./revset-palette.ts";
import { lookup, type RosettaEntry } from "./rosetta.ts";

/**
 * One lookup sheet, two kinds of answer.
 *
 * It began as the ⌘G Git-to-jj sheet, and the revset palette was drafted as a
 * second sheet beside it. They merged because the split could not answer the
 * question that motivated both: someone typing `branch` needs to be told that
 * the word here is *bookmark* (the translation) **and** handed
 * `bookmarks(exact:"…")` (the thing to type). Two sheets can only ever give
 * half of that, and the person asking is the one least able to know which half
 * they are in.
 *
 * What keeps them from diluting each other is that they are sections, not one
 * ranked list: each has its own best row, so twenty curated Git rows cannot be
 * pushed under fifty-eight functions. The entrance decides which section leads
 * and where the cursor starts — ⌘G aims at the translation, ⌘K at the palette —
 * so each key keeps the aim it had when it was its own sheet.
 *
 * ⏎ acts on the selected row, and what that means comes from the row: a Git row
 * copies the commands it explains, a revset row completes the word in the
 * revset field. That is not the ⏎ collision the palette was refused inside the
 * field itself — there two meanings competed over one hidden state; here the
 * row that decides is the row under the cursor, in view, with its answer
 * already open.
 *
 * The Git answer still does not offer to run anything: for most rows the answer
 * *is* a keystroke in this window, and a Run button that worked for some rows
 * and not others would be worse than none.
 *
 * ponytail: no fuzzy matcher, no history. Word-overlap scoring over ninety rows
 * is indistinguishable from something cleverer at this size; revisit when a row
 * that should be first is not.
 */

/** Which section the entrance aimed at: it leads, and the cursor starts in it. */
export type LookupFocus = "git" | "revset";

/** Enough of jj's vocabulary to scroll, not enough to be the wall in ⌘L. */
const REVSET_LIMIT = 40;

type Row =
  | { readonly key: string; readonly kind: "git"; readonly entry: RosettaEntry }
  | { readonly key: string; readonly kind: "revset"; readonly row: RevsetRow };

export function Lookup({ focus, onClose }: { focus: LookupFocus; onClose(): void }) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // The sheet exists to be typed into, so the field is the landing spot; the
  // hook takes over the focus-on-mount this component used to do itself. It
  // also restores focus on close, which is what puts the caret back in the
  // revset field after a row is inserted — no focus plumbing of our own.
  const panel = useModal(input);

  const { revsetDraft, setRevsetDraft } = useRepo();
  const aliases = useRevsetAliases();
  const bookmarks = useBookmarks();
  const workspaces = useWorkspaces();
  const functions = useRevsetFunctions();

  const everyRevsetRow = useMemo(
    () =>
      revsetRows({
        aliases: aliases.data,
        bookmarks: bookmarks.data,
        workspaces: workspaces.data,
        functions: functions.data,
      }),
    [aliases.data, bookmarks.data, workspaces.data, functions.data],
  );

  const gitResults = useMemo(() => lookup(query), [query]);
  const revsetResults = useMemo(
    () => rankRevsetRows(everyRevsetRow, query, REVSET_LIMIT),
    [everyRevsetRow, query],
  );

  // One flat list under the cursor, in section order, so ↓ walks out of the
  // leading section and into the other one instead of stopping at its edge.
  const rows = useMemo<Row[]>(() => {
    const git = gitResults.map<Row>((entry) => ({ key: `git:${entry.git}`, kind: "git", entry }));
    const revset = revsetResults.map<Row>((row) => ({
      key: `revset:${row.kind}:${row.name}`,
      kind: "revset",
      row,
    }));
    return focus === "revset" ? [...revset, ...git] : [...git, ...revset];
  }, [focus, gitResults, revsetResults]);

  // A typed query singles out its best answer; an untouched sheet is a
  // reference list with nothing selected, which is also why `cursor` starts
  // unset rather than at zero.
  const at = cursor ?? (query.trim() ? 0 : undefined);
  const selected = at === undefined ? undefined : rows[Math.min(at, rows.length - 1)];
  const selectedGit = selected?.kind === "git" ? selected.entry : undefined;

  const copy = () => {
    if (!selectedGit) return;
    void navigator.clipboard.writeText(selectedGit.runs.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  /** Put a revset row's text in the field and get out of the way. */
  const insert = (row: RevsetRow) => {
    setRevsetDraft(insertIntoDraft(revsetDraft, row.insert));
    onClose();
  };

  /**
   * ⏎ on the selected row — the one key whose meaning the row decides.
   *
   * A Git row's answer is already open above the list, so what ⏎ adds there is
   * the copy; a revset row has nothing to read, so ⏎ is the insert.
   */
  const confirm = (row: Row) => (row.kind === "git" ? copy() : insert(row.row));

  /** A click. Reading a Git row means selecting it; a revset row goes straight in. */
  const choose = (row: Row, index: number) =>
    row.kind === "git" ? setCursor(index) : insert(row.row);

  const move = (delta: number) => {
    if (rows.length === 0) return;
    setCursor(Math.min(rows.length - 1, Math.max(0, (at ?? -1) + delta)));
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: 96,
        background: "rgba(0,0,0,0.24)",
        zIndex: 110,
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        // The heading is an instruction, not a name; the label is what the key
        // that opened this is called everywhere else in the window.
        aria-label={focus === "git" ? t("Look up a git command") : t("Look up a revset")}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        style={{
          display: "flex",
          flexDirection: "column",
          width: 720,
          maxHeight: "calc(100vh - 140px)",
          padding: "16px 22px 20px",
          borderRadius: 12,
          background: "var(--u-bg-raised)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.28)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
            {focus === "git"
              ? t("Type the git command you were reaching for")
              : t("Type a name, a bookmark, or a jj function")}
          </h2>
          <span style={{ flexGrow: 1 }} />
          <button
            type="button"
            className="tb-btn"
            style={{ height: 22, background: "transparent" }}
            onClick={onClose}
          >
            <span className="key">Esc</span>
          </button>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            height: 38,
            padding: "0 12px",
            flexShrink: 0,
            borderRadius: 8,
            background: "var(--u-bg-raised)",
            border: "1px solid var(--u-accent)",
            boxShadow: "0 0 0 3px var(--u-accent-soft)",
          }}
        >
          <span className="mono ter" style={{ fontSize: 13 }}>
            {focus === "git" ? "$" : "▽"}
          </span>
          <input
            ref={input}
            className="mono selectable"
            value={query}
            spellCheck={false}
            placeholder={focus === "git" ? "git commit -am …" : "boo…"}
            onChange={(event) => {
              setQuery(event.target.value);
              // A new query is a new list; the cursor goes back to defaulting
              // rather than pointing at whatever now sits at that index.
              setCursor(undefined);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
              if (event.key === "ArrowDown") {
                event.preventDefault();
                move(1);
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                move(-1);
              }
              if (event.key === "Enter") {
                event.preventDefault();
                if (selected) confirm(selected);
              }
              // Text entry owns its keys; the window's map must not see them.
              event.stopPropagation();
            }}
            aria-label={focus === "git" ? t("Git command") : t("Revset")}
            style={{
              flexGrow: 1,
              minWidth: 0,
              fontSize: 13.5,
              background: "transparent",
              outline: "none",
            }}
          />
        </div>

        <div className="u-scroll" style={{ minHeight: 0, marginTop: 16 }}>
          {/* The Git answer is a detail pane for the selected row, so it stays
              at the top whichever section is leading. */}
          {selectedGit && <Answer entry={selectedGit} copied={copied} onCopy={copy} />}

          {rows.length === 0 && (
            <div className="sec" style={{ padding: "4px 4px 8px" }}>
              {focus === "git"
                ? t(
                    "Nothing here matches that. The command may already work the same way — or it may be one jj has no answer for, which is worth knowing too.",
                  )
                : t(
                    "Nothing matches that. Names you save, your bookmarks and every jj function are here; a change ID goes straight in the field.",
                  )}
            </div>
          )}

          {rows.map((row, index) => {
            const first = index === 0 || rows[index - 1]!.kind !== row.kind;
            const count = row.kind === "git" ? gitResults.length : revsetResults.length;
            return (
              <div key={row.key} style={{ display: "flex", flexDirection: "column" }}>
                {/* A section head appears where the kind changes, so the two
                    lists read as two answers rather than one mixed ranking. */}
                {first && (
                  <div
                    className="side-head"
                    style={{ display: "flex", gap: 8, padding: "12px 0 4px" }}
                  >
                    {row.kind === "git" ? t("IF YOU CAME FROM GIT") : t("TO PUT IN THE FIELD")}
                    <span className="ter" style={{ fontWeight: 400 }}>
                      {count}
                    </span>
                  </div>
                )}
                {row.kind === "git" ? (
                  <RowButton
                    selected={row === selected}
                    striped={index % 2 === 1}
                    onClick={() => choose(row, index)}
                  >
                    <span className="mono ter">{row.entry.git}</span>
                    <span className="mono">{row.entry.runs[0] ?? "—"}</span>
                    <span className="sec" style={{ fontSize: 11.5 }}>
                      {row.entry.steps[0]
                        ? `${t(row.entry.steps[0].label)}${
                            row.entry.steps[0].shortcut ? ` · ${row.entry.steps[0].shortcut}` : ""
                          }`
                        : t("No key for it; the command is the answer.")}
                    </span>
                  </RowButton>
                ) : (
                  // The same three columns as a Git row, and the same meaning
                  // in each: what you are looking for, what it becomes, and
                  // what that is. A bookmark is the clearest case — `main`
                  // becomes `bookmarks(exact:"main")`, and the row says so
                  // before you press anything.
                  <RowButton
                    selected={row === selected}
                    striped={index % 2 === 1}
                    onClick={() => choose(row, index)}
                  >
                    <span style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
                      <span className="pill">{t(KIND_LABELS[row.row.kind])}</span>
                      <span className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                        {row.row.name}
                      </span>
                    </span>
                    <span className="mono ter">
                      {row.row.insert === row.row.name ? "" : row.row.insert}
                    </span>
                    {/* jj's own sentence for a function, the expansion for a
                        saved name — data either way, never translated. */}
                    <span className="sec" style={{ fontSize: 11.5 }}>
                      {row.row.detail}
                    </span>
                  </RowButton>
                )}
              </div>
            );
          })}

          <div className="sec" style={{ marginTop: 14, fontSize: 11.5, lineHeight: 1.5 }}>
            <KeyLine
              line="Ukemi never hides the command it ran — {key} lists every one this window has run, in order."
              cap="⌘J"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** One row's full answer, in the order a switcher needs it. */
function Answer({
  entry,
  copied,
  onCopy,
}: {
  entry: RosettaEntry;
  copied: boolean;
  onCopy(): void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "14px 16px",
        borderRadius: 8,
        background: "var(--u-bg-sunken)",
      }}
    >
      {entry.steps.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="side-head" style={{ padding: 0 }}>
            {t("IN THIS WINDOW")}
          </div>
          {entry.steps.map((step, index) => (
            <div key={step.label} className="step" data-variant="primary">
              <span>
                {entry.steps.length > 1 && (
                  <span className="ter" style={{ marginRight: 8 }}>
                    {index + 1}
                  </span>
                )}
                {t(step.label)}
              </span>
              {step.shortcut && <span className="key">{step.shortcut}</span>}
            </div>
          ))}
        </div>
      )}

      {entry.steps.length > 0 && <Rule />}

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <div className="side-head" style={{ padding: 0 }}>
          {t("WHAT ACTUALLY RUNS")}
        </div>
        <div className="mono selectable" style={{ lineHeight: 1.75 }}>
          {entry.runs.map((run) => (
            <div key={run}>{run}</div>
          ))}
        </div>
      </div>

      <Rule />

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <div className="side-head" style={{ padding: 0 }}>
          {t("WHY IT DIFFERS")}
        </div>
        <div className="sec" style={{ lineHeight: 1.6 }}>
          {t(entry.why)}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 2 }}>
        <button type="button" className="tb-btn" data-variant="primary" onClick={onCopy}>
          {copied ? t("Copied") : t("Copy the commands")} <span className="key">⏎</span>
        </button>
        <span style={{ flexGrow: 1 }} />
        <span className="sec" style={{ fontSize: 11.5 }}>
          <KeyLine line="Whatever you run, {key} takes it back." cap="⌘Z" />
        </span>
      </div>
    </div>
  );
}

const Rule = () => <div style={{ height: 1, background: "var(--u-line-faint)" }} />;

/**
 * One row of either section: same edges, same three columns, same selected
 * fill, so the cursor moving between the two lists does not look like it
 * changed lists.
 */
function RowButton({
  selected,
  striped,
  onClick,
  children,
}: {
  selected: boolean;
  striped: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected}
      style={{
        display: "grid",
        gridTemplateColumns: "196px 176px minmax(0, 1fr)",
        alignItems: "center",
        gap: 12,
        minHeight: 28,
        padding: "3px 4px",
        borderRadius: "var(--u-radius)",
        textAlign: "left",
        color: "inherit",
        background: selected
          ? "var(--u-accent-soft)"
          : striped
            ? "var(--u-bg-sunken)"
            : "transparent",
      }}
    >
      {children}
    </button>
  );
}

/**
 * A sentence with one key cap in it, kept as a single catalog entry.
 *
 * Splitting the translated line on its `{key}` placeholder is what lets the cap
 * sit where the sentence wants it: Korean puts it near the verb, English near
 * the subject, and concatenating two halves could only ever get one of them
 * right.
 */
function KeyLine({ line, cap }: { line: string; cap: string }) {
  const [before, after] = tParts(line, "key");
  return (
    <>
      {before}
      <span className="key">{cap}</span>
      {after}
    </>
  );
}

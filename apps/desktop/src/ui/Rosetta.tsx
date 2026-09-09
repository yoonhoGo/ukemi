import { useEffect, useMemo, useRef, useState } from "react";
import { lookup, type RosettaEntry } from "./rosetta.ts";

/**
 * The ⌘G sheet: type the Git command you were reaching for.
 *
 * This is the part of the onboarding that keeps working after the welcome
 * cards are gone, which is why it is a permanent affordance and not a tour
 * step. The answer is ordered the way it is needed — what to press here, what
 * will actually run, then why the two differ — and it deliberately does not
 * offer to run anything: for most rows the answer *is* a keystroke in this
 * window, and a Run button that worked for some rows and not others would be
 * worse than none.
 *
 * ponytail: no fuzzy matcher, no history. Word-overlap scoring over twenty
 * rows is indistinguishable from something cleverer at this size; revisit if
 * the table ever grows past a screenful.
 */
export function Rosetta({ onClose }: { onClose(): void }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const results = useMemo(() => lookup(query), [query]);
  // A typed query selects its best answer for you; an untouched sheet is a
  // reference list with nothing singled out.
  const selected: RosettaEntry | undefined =
    results.find((entry) => entry.git === picked) ?? (query.trim() ? results[0] : undefined);

  useEffect(() => input.current?.focus(), []);

  const copy = () => {
    if (!selected) return;
    void navigator.clipboard.writeText(selected.runs.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  const move = (delta: number) => {
    if (results.length === 0) return;
    const at = selected ? results.findIndex((entry) => entry.git === selected.git) : -1;
    const next = results[Math.min(results.length - 1, Math.max(0, at + delta))];
    if (next) setPicked(next.git);
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
        role="dialog"
        aria-label="Look up a git command"
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
            Type the git command you were reaching for
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
            $
          </span>
          <input
            ref={input}
            className="mono selectable"
            value={query}
            spellCheck={false}
            placeholder="git commit -am …"
            onChange={(event) => {
              setQuery(event.target.value);
              setPicked(undefined);
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
                copy();
              }
              // Text entry owns its keys; the window's map must not see them.
              event.stopPropagation();
            }}
            aria-label="Git command"
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
          {selected && <Answer entry={selected} copied={copied} onCopy={copy} />}

          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 16 }}>
            <div className="side-head" style={{ padding: "0 0 4px" }}>
              {query.trim()
                ? `${results.length} match${results.length === 1 ? "" : "es"}`
                : "ASKED MOST"}
            </div>
            {results.length === 0 && (
              <div className="sec" style={{ padding: "4px 4px 8px" }}>
                Nothing here matches that. The command may already work the same way — or
                it may be one jj has no answer for, which is worth knowing too.
              </div>
            )}
            {results.map((entry, index) => (
              <button
                type="button"
                key={entry.git}
                onClick={() => setPicked(entry.git)}
                aria-current={entry.git === selected?.git}
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
                  background:
                    entry.git === selected?.git
                      ? "var(--u-accent-soft)"
                      : index % 2 === 1
                        ? "var(--u-bg-sunken)"
                        : "transparent",
                }}
              >
                <span className="mono ter">{entry.git}</span>
                <span className="mono">{entry.runs[0] ?? "—"}</span>
                <span className="sec" style={{ fontSize: 11.5 }}>
                  {entry.steps[0]
                    ? `${entry.steps[0].label}${
                        entry.steps[0].shortcut ? ` · ${entry.steps[0].shortcut}` : ""
                      }`
                    : "No key for it; the command is the answer."}
                </span>
              </button>
            ))}
          </div>

          <div className="sec" style={{ marginTop: 14, fontSize: 11.5, lineHeight: 1.5 }}>
            Ukemi never hides the command it ran — <span className="key">⌘J</span> lists every
            one this window has run, in order.
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
            IN THIS WINDOW
          </div>
          {entry.steps.map((step, index) => (
            <div key={step.label} className="step" data-variant="primary">
              <span>
                {entry.steps.length > 1 && (
                  <span className="ter" style={{ marginRight: 8 }}>
                    {index + 1}
                  </span>
                )}
                {step.label}
              </span>
              {step.shortcut && <span className="key">{step.shortcut}</span>}
            </div>
          ))}
        </div>
      )}

      {entry.steps.length > 0 && <Rule />}

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <div className="side-head" style={{ padding: 0 }}>
          WHAT ACTUALLY RUNS
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
          WHY IT DIFFERS
        </div>
        <div className="sec" style={{ lineHeight: 1.6 }}>
          {entry.why}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 2 }}>
        <button type="button" className="tb-btn" data-variant="primary" onClick={onCopy}>
          {copied ? "Copied" : "Copy the commands"} <span className="key">⏎</span>
        </button>
        <span style={{ flexGrow: 1 }} />
        <span className="sec" style={{ fontSize: 11.5 }}>
          Whatever you run, <span className="key">⌘Z</span> takes it back.
        </span>
      </div>
    </div>
  );
}

const Rule = () => <div style={{ height: 1, background: "var(--u-line-faint)" }} />;

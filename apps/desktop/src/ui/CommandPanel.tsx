import { useState } from "react";
import type { CommandRecord } from "@ukemi/domain";
import { useCommandLog, useGitInfo } from "../repo.tsx";
import { isRead, shellLine } from "./command-line.ts";
import { clockTime } from "./time.ts";

/**
 * The transparency panel — design §4.8.
 *
 * Every `jj` and `gh` invocation this window made, verbatim, newest first,
 * with its exit code and stderr. Reads are hidden by default because there are
 * hundreds of them and none changed anything; the toggle is there for the
 * moment you want to know exactly what the graph asked.
 *
 * The header says what Git sees: in a colocated repo every bookmark *is* a Git
 * branch after each command, so the mapping needs no table — just the fact.
 */
export function CommandPanel({ onClose }: { onClose(): void }) {
  const log = useCommandLog();
  const git = useGitInfo();
  const [showReads, setShowReads] = useState(false);
  const [copied, setCopied] = useState<string | undefined>(undefined);

  const shown = [...log].reverse().filter((record) => showReads || !isRead(record));

  const copy = (record: CommandRecord) => {
    const line = shellLine(record);
    void navigator.clipboard.writeText(line).then(() => {
      setCopied(record.startedAt);
      setTimeout(() => setCopied(undefined), 1200);
    });
  };

  return (
    <div
      style={{
        height: 220,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--u-bg-sunken)",
        borderTop: "1px solid var(--u-line-strong)",
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 12, height: 30, padding: "0 14px" }}
      >
        <span className="side-head" style={{ padding: 0 }}>
          COMMANDS
        </span>
        <span className="sec" style={{ fontSize: "var(--u-font-size-small)" }}>
          {git.data
            ? git.data.colocated
              ? "Colocated with Git: every bookmark is exported as a branch after each command."
              : "Not colocated: Git tools see .jj/repo/store/git, not this folder."
            : ""}
          {git.data && git.data.remotes.length > 0 && (
            <>
              {" · "}
              {git.data.remotes.map((remote) => `${remote.name} → ${remote.url}`).join(", ")}
            </>
          )}
        </span>
        <span style={{ flexGrow: 1 }} />
        <label className="sec" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
          <input
            type="checkbox"
            checked={showReads}
            onChange={(event) => setShowReads(event.target.checked)}
          />
          show reads
        </label>
        <button type="button" className="tb-btn" style={{ height: 24, fontSize: 12 }} onClick={onClose}>
          Close <span className="key">⌘J</span>
        </button>
      </div>

      <div className="u-scroll" style={{ flexGrow: 1, minHeight: 0, padding: "0 14px 10px" }}>
        {shown.length === 0 && (
          <div className="sec" style={{ fontSize: 12 }}>
            {showReads ? "Nothing has run yet." : "No write has run in this window yet."}
          </div>
        )}
        {shown.map((record) => (
          <div
            key={record.startedAt + record.args.join(" ")}
            style={{ display: "flex", alignItems: "baseline", gap: 8, minHeight: 22 }}
          >
            <span className="ter mono" style={{ fontSize: 10.5, flexShrink: 0 }}>
              {clockTime(record.startedAt)}
            </span>
            <span
              className="mono selectable"
              style={{
                flexGrow: 1,
                minWidth: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                color: record.code === 0 ? "inherit" : "var(--u-conflict)",
              }}
            >
              {shellLine(record)}
              {record.code !== 0 && record.stderr.trim() && (
                <span className="sec" style={{ display: "block" }}>
                  {record.stderr.trim()}
                </span>
              )}
            </span>
            <span className="ter" style={{ fontSize: 10.5, flexShrink: 0 }}>
              {record.code !== 0 ? `exit ${record.code} · ` : ""}
              {record.durationMs}ms
            </span>
            <button
              type="button"
              className="key"
              style={{ flexShrink: 0 }}
              onClick={() => copy(record)}
              title="Copy"
            >
              {copied === record.startedAt ? "copied" : "copy"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import type { FileChange, Revision } from "@ukemi/domain";
import { useDiffSummary, useFileDiff, useJjMutation, useRepo } from "../repo.tsx";
import { authorInitials, nodeColor } from "./change-color.ts";
import { relativeTime } from "./time.ts";

const STATUS_MARK: Record<FileChange["status"], { mark: string; color: string }> = {
  added: { mark: "A", color: "var(--u-added)" },
  modified: { mark: "M", color: "var(--u-modified)" },
  removed: { mark: "D", color: "var(--u-removed)" },
  renamed: { mark: "R", color: "var(--u-modified)" },
  copied: { mark: "C", color: "var(--u-modified)" },
};

/**
 * The description editor.
 *
 * There is no staging area to decide what goes in, so the description is
 * editable at all times and for any revision, not just the tip (design §4.2).
 * Committed on ⌘↩ or blur; Esc abandons the edit.
 */
function DescriptionEditor({ revision }: { revision: Revision }) {
  const [draft, setDraft] = useState(revision.description);
  const describe = useJjMutation((port, message: string) =>
    port.describe(revision.changeId, message),
  );

  // Re-seed when the selection changes, or the previous revision's text would
  // leak into the next one's editor.
  useEffect(() => setDraft(revision.description), [revision.changeId, revision.description]);

  const dirty = draft !== revision.description;
  const commit = () => {
    if (dirty) describe.mutate(draft);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "8px 10px",
        borderRadius: 7,
        background: "var(--u-bg-raised)",
        border: "1px solid var(--u-line-strong)",
      }}
    >
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.metaKey) {
            event.preventDefault();
            commit();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            setDraft(revision.description);
            event.currentTarget.blur();
          }
          // Everything else is text entry: keep the window's shortcuts out of it.
          event.stopPropagation();
        }}
        placeholder="Describe this change…"
        rows={Math.min(6, Math.max(2, draft.split("\n").length))}
        spellCheck={false}
        style={{
          resize: "none",
          font: "inherit",
          color: "inherit",
          background: "transparent",
          userSelect: "text",
          cursor: "text",
          outline: "none",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="sec" style={{ fontSize: "var(--u-font-size-small)" }}>
          {describe.isPending ? "Saving…" : dirty ? "Unsaved" : ""}
        </span>
        <span style={{ flexGrow: 1 }} />
        <span className="key">⌘↩</span>
      </div>
    </div>
  );
}

/** One jj verb, its shortcut, and why it is or is not available right now. */
function Step({
  label,
  shortcut,
  onRun,
  disabled,
  title,
  primary,
}: {
  label: string;
  shortcut: string;
  onRun(): void;
  disabled?: boolean | undefined;
  title?: string | undefined;
  primary?: boolean | undefined;
}) {
  return (
    <button
      type="button"
      className="step"
      onClick={onRun}
      disabled={disabled}
      title={title}
      {...(primary ? { "data-variant": "primary" } : {})}
    >
      <span>{label}</span>
      <span className="key">{shortcut}</span>
    </button>
  );
}

function Diff({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="mono selectable" style={{ padding: "6px 0" }}>
      {lines.map((line, index) => {
        // Skip the git header noise; the file name is already in the list above.
        if (
          line.startsWith("diff --git") ||
          line.startsWith("index ") ||
          line.startsWith("--- ") ||
          line.startsWith("+++ ")
        ) {
          return null;
        }
        const kind = line.startsWith("@@")
          ? "hunk"
          : line.startsWith("+")
            ? "add"
            : line.startsWith("-")
              ? "del"
              : undefined;
        return (
          <div
            className="diff-line"
            key={index}
            {...(kind ? { "data-kind": kind } : {})}
          >
            <span className="ln">{kind === "hunk" ? "" : index + 1}</span>
            <span>{line}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Inspector({ revision }: { revision: Revision | undefined }) {
  const { isPinned } = useRepo();
  const [openFile, setOpenFile] = useState<string | undefined>(undefined);
  const files = useDiffSummary(revision?.changeId);
  const diff = useFileDiff(revision?.changeId, openFile);

  const newChange = useJjMutation((port, parent: string) => port.newChange([parent]));
  const edit = useJjMutation((port, rev: string) => port.edit(rev));
  const abandon = useJjMutation((port, rev: string) => port.abandon([rev]));

  useEffect(() => setOpenFile(undefined), [revision?.changeId]);

  if (!revision) {
    return (
      <aside style={panelStyle}>
        <div className="sec" style={{ padding: 16 }}>
          Select a revision.
        </div>
      </aside>
    );
  }

  const color = nodeColor(revision);
  const readOnly = isPinned || revision.isImmutable;
  const readOnlyReason = isPinned
    ? "The window is parked on a past operation. Return to now to make changes."
    : revision.isImmutable
      ? "This revision is immutable."
      : undefined;

  return (
    <aside style={panelStyle}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: "14px 16px 12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="mono selectable" style={{ fontSize: 15, fontWeight: 600 }}>
            <span style={{ color }}>{revision.changeId.slice(0, 2)}</span>
            {revision.changeId.slice(2, 12)}
          </div>
          {revision.isWorkingCopy && <span className="pill">@ working copy</span>}
          {revision.hasConflict && (
            <span className="pill" data-kind="conflict">
              conflict
            </span>
          )}
          <span style={{ flexGrow: 1 }} />
          <span className="mono ter selectable" style={{ fontSize: 11 }}>
            {revision.commitId.slice(0, 7)}
          </span>
        </div>

        {readOnly ? (
          <div
            className="sec"
            style={{
              padding: "8px 10px",
              borderRadius: 7,
              background: "var(--u-bg-sunken)",
            }}
          >
            {revision.description || "(no description set)"}
          </div>
        ) : (
          <DescriptionEditor revision={revision} />
        )}

        <div
          className="sec"
          style={{ display: "flex", gap: 14, fontSize: 11.5, flexWrap: "wrap" }}
        >
          <span>
            {revision.parents.length === 1 ? "Parent " : "Parents "}
            {revision.parents.map((parent) => (
              <span className="mono" key={parent}>
                {parent.slice(0, 8)}{" "}
              </span>
            ))}
          </span>
          <span>
            <span
              className="avatar"
              style={{
                background: color,
                display: "inline-flex",
                width: 16,
                height: 16,
                fontSize: 8,
                verticalAlign: "middle",
                marginRight: 4,
              }}
            >
              {authorInitials(revision.author.name, revision.author.email)}
            </span>
            {revision.author.name || revision.author.email}
          </span>
          <span>{relativeTime(revision.author.timestamp)}</span>
        </div>
      </div>

      <div
        style={{ padding: "0 16px 12px", display: "flex", flexDirection: "column", gap: 6 }}
      >
        <div className="side-head" style={{ padding: 0 }}>
          NEXT STEPS
        </div>
        <Step
          label="Start new change on top"
          shortcut="⌘N"
          primary
          disabled={readOnly}
          title={readOnlyReason}
          onRun={() => newChange.mutate(revision.changeId)}
        />
        <Step
          label="Edit this change"
          shortcut="⌘E"
          disabled={readOnly || revision.isWorkingCopy}
          title={readOnlyReason}
          onRun={() => edit.mutate(revision.changeId)}
        />
        <Step
          label="Abandon this change"
          shortcut="⌘⌫"
          disabled={readOnly}
          title={readOnlyReason}
          onRun={() => abandon.mutate(revision.changeId)}
        />
      </div>

      <div
        style={{
          padding: "10px 16px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          borderTop: "1px solid var(--u-line-faint)",
        }}
      >
        <div className="side-head" style={{ padding: "0 0 4px" }}>
          {files.data ? `${files.data.length} FILES CHANGED` : "FILES CHANGED"}
        </div>
        {files.data?.length === 0 && (
          <div className="sec" style={{ fontSize: 12 }}>
            No file changes.
          </div>
        )}
        {files.data?.map((file) => {
          const status = STATUS_MARK[file.status];
          return (
            <button
              type="button"
              className="file"
              key={file.path}
              aria-selected={file.path === openFile}
              onClick={() => setOpenFile(file.path === openFile ? undefined : file.path)}
            >
              <span
                className="mono"
                style={{ color: status.color, fontWeight: 700, width: 10 }}
              >
                {status.mark}
              </span>
              <span
                style={{
                  flexGrow: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  direction: "rtl",
                  textAlign: "left",
                }}
              >
                {file.path}
              </span>
            </button>
          );
        })}
      </div>

      {openFile && (
        <div
          className="u-scroll"
          style={{
            flexGrow: 1,
            minHeight: 0,
            margin: "6px 16px 14px",
            borderRadius: 8,
            background: "var(--u-bg-raised)",
            border: "1px solid var(--u-line)",
          }}
        >
          {diff.isPending && (
            <div className="sec" style={{ padding: 10 }}>
              Loading diff…
            </div>
          )}
          {diff.data && <Diff text={diff.data} />}
        </div>
      )}
    </aside>
  );
}

const panelStyle: React.CSSProperties = {
  width: 372,
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  background: "var(--u-bg-inspector)",
  borderLeft: "1px solid var(--u-line)",
};

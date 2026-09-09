import { useRef } from "react";
import { t } from "../i18n/i18n.ts";
import { useModal } from "./modal.ts";

/** The ⌘/ sheet. Mirrors the key map in `App`; both must move together. */
const GROUPS = [
  {
    title: "Navigate",
    items: [
      ["↑ ↓", "Move selection"],
      ["⌘L", "Focus the revset field"],
      ["⌘1…⌘7", "Saved revsets"],
      ["⌘,", "Settings"],
      ["⌘R", "Reload from disk"],
      ["⌘⇧W", "Workspace board"],
      ["⌘K", "Look up a revset"],
      ["⌘G", "Look up a git command"],
      ["⌘J", "Commands this window ran"],
      ["⌘O", "Open another repository"],
    ],
  },
  {
    title: "Change the history",
    items: [
      ["⌘N", "New change on top of the selection"],
      ["⌘E", "Edit the selected change"],
      ["⌘⌫", "Abandon the selected change"],
      ["⌘⇧S", "Split by hunk"],
      ["⌘⇧K", "Squash hunks into the parent"],
      ["⌘⇧A", "Absorb into the ancestors that last touched each line"],
      ["⌘↩", "Save the description / run the sheet"],
    ],
  },
  {
    title: "Move history",
    items: [
      ["⌥ drag", "Rebase a revision onto another"],
      ["R", "…moving this revision only"],
      ["S", "…moving it and its descendants"],
      ["B", "…moving its whole branch"],
    ],
  },
  {
    title: "Time travel",
    items: [
      ["← →", "Move the operation playhead"],
      ["⌘Z", "Undo the last operation"],
      ["⌘⇧R", "Restore to the parked operation"],
      ["Esc", "Back to now"],
    ],
  },
  {
    title: "In the diff sheet",
    items: [["↑ ↓", "Move between files"]],
  },
  {
    title: "In the hunk sheet",
    items: [
      ["space", "Check or uncheck the focused hunk"],
      ["↑ ↓", "Move between hunks"],
      ["⌘A", "Check or uncheck everything"],
    ],
  },
  {
    title: "Remotes",
    items: [
      ["⇧⌘F", "Fetch"],
      ["⇧⌘P", "Push"],
      ["⌘⌥C", "Copy the last jj command"],
    ],
  },
] as const;

export function Shortcuts({ onClose }: { onClose(): void }) {
  // The sheet is a reference card with one control in it, so Done is both the
  // only sensible landing spot and the whole focus ring.
  const done = useRef<HTMLButtonElement>(null);
  const panel = useModal(done);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.24)",
        zIndex: 100,
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        // The visible heading is just "Shortcuts"; the label says what kind.
        aria-label={t("Keyboard shortcuts")}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 720,
          maxHeight: "80vh",
          overflow: "auto",
          padding: "18px 22px 22px",
          borderRadius: 12,
          background: "var(--u-bg-raised)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.28)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{t("Shortcuts")}</h2>
          <span className="sec" style={{ fontSize: 11.5 }}>
            {t("No command is typed. Every jj verb is a key or a drag.")}
          </span>
          <span style={{ flexGrow: 1 }} />
          <button type="button" ref={done} className="tb-btn" onClick={onClose}>
            {t("Done")} <span className="key">Esc</span>
          </button>
        </div>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px 32px" }}
        >
          {GROUPS.map((group) => (
            <section key={group.title}>
              <div className="side-head" style={{ padding: "0 0 6px" }}>
                {t(group.title).toUpperCase()}
              </div>
              {group.items.map(([keys, label]) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    height: 26,
                  }}
                >
                  <span style={{ flexGrow: 1 }}>{t(label)}</span>
                  {keys.split(" ").map((key) => (
                    <span className="key" key={key}>
                      {key}
                    </span>
                  ))}
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

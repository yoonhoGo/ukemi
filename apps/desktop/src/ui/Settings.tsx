import { useRef } from "react";
import { t } from "../i18n/i18n.ts";
import { LanguagePicker } from "./LanguagePicker.tsx";
import { ThemePicker } from "./ThemePicker.tsx";
import { useModal } from "./modal.ts";

/**
 * ⌘, — the two choices that are the user's, not the repository's.
 *
 * The theme and language pickers used to be eleven rows at the bottom of the
 * sidebar, which is the primary navigation: a list of bookmarks, workspaces and
 * revsets with the app's own settings stapled underneath it. macOS puts
 * settings behind ⌘, and the sidebar gets its bottom back — which is where the
 * transition strip lives, and that one *is* about the repository in front of
 * you.
 *
 * Same overlay idiom as the other four sheets, `useModal` included, so Tab
 * stays inside and focus goes back where it came from.
 */
export function Settings({ onClose }: { onClose(): void }) {
  // Two lists of radio-ish rows and one Done button: landing on Done is the
  // one spot that is not also a choice being made.
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
        aria-label={t("Settings")}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="u-scroll"
        style={{
          display: "flex",
          flexDirection: "column",
          width: 420,
          maxHeight: "80vh",
          padding: "16px 18px 18px",
          borderRadius: 12,
          background: "var(--u-bg-raised)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.28)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{t("Settings")}</h2>
          <span style={{ flexGrow: 1 }} />
          <button type="button" ref={done} className="tb-btn" onClick={onClose}>
            {t("Done")} <span className="key">Esc</span>
          </button>
        </div>
        {/* Side by side, because neither list is long and reading them
            together is how you would answer "what does this window look
            like?" — which is the one question this sheet answers. */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
          <ThemePicker />
          <LanguagePicker />
        </div>
      </div>
    </div>
  );
}

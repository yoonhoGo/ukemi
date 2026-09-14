import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { t } from "../i18n/i18n.ts";
import {
  INSTALL_COMMAND,
  isNewer,
  latestRelease,
  setUpdateCheckEnabled,
  updateCheckEnabled,
} from "./update-check.ts";

/**
 * `undefined` while the answer is still out or the check is off; otherwise a
 * result, whose `newer` is the version to move to and is absent when there is
 * none. Two states in one object because "checked, and you are current" is a
 * thing the Settings row has to be able to say.
 */
type Answer = { readonly newer?: string } | undefined;

function useNewerRelease(enabled: boolean): Answer {
  const [answer, setAnswer] = useState<Answer>(undefined);

  useEffect(() => {
    if (!enabled) {
      setAnswer(undefined);
      return;
    }
    let live = true;
    void Promise.all([getVersion(), latestRelease()]).then(([current, latest]) => {
      if (!live) return;
      setAnswer(latest !== undefined && isNewer(latest, current) ? { newer: latest } : {});
    });
    return () => {
      live = false;
    };
  }, [enabled]);

  return answer;
}

/**
 * The startup notice, in the same thin strip the pinned-operation and error
 * banners use.
 *
 * It offers the install command rather than a link, because opening a URL is
 * a plugin this window does not have and a copyable command is what the rest
 * of the app hands you anyway (the command log, the Rosetta table). Running it
 * again is the whole update.
 */
export function UpdateBanner() {
  // Read once: the toggle in Settings takes effect at the next launch, and a
  // banner appearing behind an open sheet would be the wrong moment for it.
  const [enabled] = useState(updateCheckEnabled);
  const answer = useNewerRelease(enabled);
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  if (dismissed || answer?.newer === undefined) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        minHeight: 26,
        padding: "4px 14px",
        flexShrink: 0,
        background: "var(--u-accent-soft)",
        color: "var(--u-accent)",
        fontSize: "var(--u-font-size-small)",
        fontWeight: 600,
      }}
    >
      {t("Ukemi {version} is out.", { version: answer.newer })}
      <span style={{ flexGrow: 1 }} />
      <button
        type="button"
        className="tb-btn"
        style={{ height: 20, fontSize: 11, background: "transparent" }}
        onClick={() => {
          void navigator.clipboard.writeText(INSTALL_COMMAND).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          });
        }}
      >
        {copied ? t("copied") : t("Copy the install command")}
      </button>
      <button
        type="button"
        className="tb-btn"
        style={{ height: 20, fontSize: 11, background: "transparent" }}
        onClick={() => setDismissed(true)}
      >
        {t("Dismiss")}
      </button>
    </div>
  );
}

/**
 * The Settings row that turns the check on.
 *
 * Switching it on checks straight away and says what it found, rather than
 * promising something at the next launch — a toggle whose only visible effect
 * is next time reads as broken.
 */
export function UpdatePicker() {
  const [enabled, setEnabled] = useState(updateCheckEnabled);
  const answer = useNewerRelease(enabled);

  return (
    <section>
      <div className="side-head">{t("Updates")}</div>
      <button
        type="button"
        className="side-item"
        aria-current={enabled}
        title={t("Asks GitHub for the latest release when the window opens. It is the only request this window makes.")}
        onClick={() => {
          setUpdateCheckEnabled(!enabled);
          setEnabled(!enabled);
        }}
      >
        <span style={{ flexGrow: 1 }}>{t("Check for a new version at startup")}</span>
      </button>
      {enabled && answer !== undefined && (
        <p
          className="selectable"
          style={{
            margin: "4px 0 0",
            fontSize: "var(--u-font-size-small)",
            color: "var(--u-text-secondary)",
          }}
        >
          {answer.newer === undefined
            ? t("This is the latest release.")
            : `${t("Ukemi {version} is out.", { version: answer.newer })} ${INSTALL_COMMAND}`}
        </p>
      )}
    </section>
  );
}

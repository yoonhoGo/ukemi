import { useSyncExternalStore, type CSSProperties } from "react";
import { t, tParts } from "../i18n/i18n.ts";
import {
  acknowledgeHint,
  hasGraduated,
  MILESTONES,
  MILESTONE_COUNT,
  pendingHint,
  progressSnapshot,
  reachedCount,
  setHintsOff,
  subscribeProgress,
  type HintAnchor,
  type Progress,
} from "./onboarding.ts";

/** The transition state, shared by the bubble, the sidebar strip and the panel. */
export function useProgress(): Progress {
  return useSyncExternalStore(subscribeProgress, progressSnapshot);
}

/**
 * Where each hint sits.
 *
 * Three fixed spots, not a positioning engine: a hint has to point at the thing
 * it is about, and every one of the seven is about the toolbar, the inspector
 * or the timeline. ponytail: measure real anchors only if a fourth region
 * appears.
 */
const PLACEMENT: Record<HintAnchor, { box: CSSProperties; pointer: CSSProperties }> = {
  // Pointing at the New button, which is the toolbar hints' usual subject; Push
  // sits in the same cluster a little further left.
  toolbar: { box: { top: 64, right: 40 }, pointer: { top: -6, right: 106 } },
  inspector: { box: { top: 132, right: 388 }, pointer: { top: 24, right: -6 } },
  sidebar: { box: { top: 132, left: 244 }, pointer: { top: 24, left: -6 } },
  timeline: { box: { bottom: 104, left: 24 }, pointer: { bottom: -6, left: 52 } },
};

/**
 * One hint, at the moment the Git reflex fired.
 *
 * Not a modal: the window behind it stays usable, and it explains the thing the
 * user *just did* rather than warning them before they do it — which is the
 * only reason it lands instead of being dismissed unread. Dismissing it is what
 * retires it, for good.
 */
export function CoachBubble({ onOpenRosetta }: { onOpenRosetta(): void }) {
  const progress = useProgress();
  const hint = pendingHint(progress);
  if (!hint) return null;

  const place = PLACEMENT[hint.anchor];
  return (
    <div style={{ position: "absolute", width: 360, zIndex: 20, ...place.box }}>
      <div
        style={{
          position: "absolute",
          width: 12,
          height: 12,
          background: "var(--u-bg-raised)",
          transform: "rotate(45deg)",
          boxShadow: "-2px -2px 4px rgba(0,0,0,0.05)",
          ...place.pointer,
        }}
      />
      <div
        role="status"
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: "14px 16px 13px",
          borderRadius: 10,
          background: "var(--u-bg-raised)",
          border: "1px solid var(--u-line)",
          boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{t(hint.title)}</div>
          <span style={{ flexGrow: 1 }} />
          <span className="sec" style={{ fontSize: 10.5, whiteSpace: "nowrap" }}>
            {t("hint {done} of {total}", {
              done: reachedCount(progress),
              total: MILESTONE_COUNT,
            })}
          </span>
        </div>
        <div className="sec" style={{ lineHeight: 1.6 }}>
          {t(hint.body)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 2 }}>
          <button
            type="button"
            className="tb-btn"
            data-variant="primary"
            style={{ height: 26 }}
            onClick={() => acknowledgeHint(hint.id)}
          >
            {t("Got it")}
          </button>
          <button
            type="button"
            className="tb-btn"
            style={{ height: 26 }}
            onClick={() => {
              // Looking something up is engaging with the hint, not ignoring
              // it, so it counts as read.
              acknowledgeHint(hint.id);
              onOpenRosetta();
            }}
          >
            {t("Look up a git command")} <span className="key">⌘G</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The one piece of permanent onboarding chrome, at the foot of the sidebar.
 *
 * Removes itself on graduation rather than lingering as a completed trophy —
 * an app that keeps reminding you that you used to use Git is an app you have
 * outgrown.
 */
export function TransitionStrip({ onOpen }: { onOpen(): void }) {
  const progress = useProgress();
  if (hasGraduated(progress)) return null;
  const done = reachedCount(progress);

  return (
    <button
      type="button"
      onClick={onOpen}
      title={t("Moving from Git — seven habits and where each one went")}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 7,
        padding: 10,
        marginBottom: 6,
        borderRadius: "var(--u-radius)",
        background: "var(--u-bg-selected)",
        color: "inherit",
        textAlign: "left",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span className="side-head" style={{ padding: 0 }}>
          {t("FROM GIT")}
        </span>
        <span style={{ flexGrow: 1 }} />
        <span className="sec" style={{ fontSize: 11 }}>
          {t("{done} of {total}", { done, total: MILESTONE_COUNT })}
        </span>
      </div>
      <Meter done={done} />
      <div className="sec" style={{ fontSize: 11, lineHeight: 1.45 }}>
        {t("Look up a git command")} <span className="key">⌘G</span>
      </div>
    </button>
  );
}

function Meter({ done }: { done: number }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {MILESTONES.map((entry, index) => (
        <span
          key={entry.id}
          style={{
            flexGrow: 1,
            height: 3,
            borderRadius: 2,
            background: index < done ? "var(--u-accent)" : "rgba(0,0,0,0.12)",
          }}
        />
      ))}
    </div>
  );
}

/** The seven, and which of them the user has actually been through. */
export function ProgressPanel({ onClose }: { onClose(): void }) {
  const progress = useProgress();
  const done = reachedCount(progress);
  const nextUp = MILESTONES.find((entry) => !progress.reached.includes(entry.id));
  const shortcutStays = tParts("{shortcut} stays either way.", "shortcut");
  // Korean puts the command first and the postposition after it, so the sentence
  // stays one key and the mono span drops into the slot.
  const [beforeCmd, afterCmd] = tParts("instead of {command}", "command");

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
        role="dialog"
        aria-label={t("Moving from Git")}
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
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{t("Moving from Git")}</h2>
          <span style={{ flexGrow: 1 }} />
          <span className="sec" style={{ fontSize: 11.5 }}>
            {t("{done} of {total}", { done, total: MILESTONE_COUNT })}
          </span>
          <button
            type="button"
            className="tb-btn"
            style={{ height: 22, background: "transparent" }}
            onClick={onClose}
          >
            <span className="key">Esc</span>
          </button>
        </div>
        <div className="sec" style={{ marginTop: 5, fontSize: 12, lineHeight: 1.5 }}>
          {t(
            "Seven habits Git gave you, and where each one went. A row ticks when you have actually done it once — not when you have read about it.",
          )}
        </div>

        <div style={{ margin: "12px 0 4px" }}>
          <Meter done={done} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 8 }}>
          {MILESTONES.map((entry) => {
            const reached = progress.reached.includes(entry.id);
            const isNext = entry.id === nextUp?.id;
            return (
              <div
                key={entry.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  minHeight: 44,
                  padding: "0 8px",
                  borderRadius: "var(--u-radius)",
                  ...(isNext ? { background: "var(--u-bg-selected)" } : {}),
                }}
              >
                <Tick state={reached ? "done" : isNext ? "next" : "todo"} />
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                    minWidth: 0,
                    flexGrow: 1,
                  }}
                >
                  <span
                    className={reached ? undefined : "sec"}
                    style={isNext ? { fontWeight: 500 } : undefined}
                  >
                    {t(entry.label)}
                  </span>
                  <span className={reached || isNext ? "sec" : "ter"} style={{ fontSize: 11 }}>
                    {beforeCmd}
                    <span className="mono" style={{ fontSize: 11 }}>
                      {entry.replaces}
                    </span>
                    {afterCmd}
                  </span>
                </div>
                {isNext && (
                  <span className="pill" data-kind="bookmark">
                    {t("next")}
                  </span>
                )}
                {!isNext && !reached && entry.shortcut && (
                  <span className="key">{entry.shortcut}</span>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ height: 1, background: "var(--u-line-faint)", margin: "12px 0" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flexGrow: 1, minWidth: 0 }}>
            <span>{t("Coach hints")}</span>
            <span className="sec" style={{ fontSize: 11, lineHeight: 1.45 }}>
              {t("Retire on their own once all seven are behind you.")}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!progress.hintsOff}
            aria-label={t("Coach hints")}
            onClick={() => setHintsOff(!progress.hintsOff)}
            style={{
              display: "flex",
              alignItems: "center",
              width: 38,
              height: 22,
              padding: 2,
              flexShrink: 0,
              borderRadius: 11,
              background: progress.hintsOff ? "rgba(0,0,0,0.16)" : "var(--u-accent)",
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                background: "#fff",
                marginLeft: progress.hintsOff ? 0 : "auto",
                boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
              }}
            />
          </button>
        </div>

        <div className="sec" style={{ marginTop: 12, fontSize: 11.5, lineHeight: 1.5 }}>
          {shortcutStays[0]}
          <span className="key">⌘G</span>
          {shortcutStays[1]}
        </div>
      </div>
    </div>
  );
}

function Tick({ state }: { state: "done" | "next" | "todo" }) {
  if (state === "done") {
    return (
      <svg viewBox="0 0 20 20" width={17} height={17} fill="none" aria-hidden>
        <circle cx="10" cy="10" r="8" fill="var(--u-accent)" />
        <path
          d="M6.4 10.2l2.4 2.4 4.8-5"
          stroke="var(--u-accent-ink)"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 20 20"
      width={17}
      height={17}
      fill="none"
      stroke={state === "next" ? "var(--u-accent)" : "var(--u-text-tertiary)"}
      strokeWidth={1.6}
      aria-hidden
    >
      <circle cx="10" cy="10" r="8" {...(state === "next" ? { strokeDasharray: "2.5 2.5" } : {})} />
    </svg>
  );
}

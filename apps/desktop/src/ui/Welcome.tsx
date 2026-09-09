import { markWelcomed } from "./onboarding.ts";

/**
 * The three cards, once ever, between opening a repo and seeing it.
 *
 * Three and not seven, deliberately: a seven-step tour gets skipped, and the
 * remaining four differences are better answered by ⌘G in the moment they come
 * up than explained here to someone who has not met them yet. What is left is
 * the set that makes a jj graph unreadable if you do not know it — no index, no
 * current branch, and undo that actually undoes.
 */

interface Card {
  readonly eyebrow: string;
  /** The Git commands this replaces, in Git's spelling. */
  readonly git: readonly string[];
  readonly headline: string;
  readonly body: string;
  readonly lead: string;
  readonly step: string;
  readonly shortcut: string;
  /** The one card whose action is the safety net, and reads as the primary. */
  readonly primary?: boolean;
}

const CARDS: readonly Card[] = [
  {
    eyebrow: "STAGING",
    git: ["git add -p", "git commit"],
    headline: "There is no index.",
    body:
      "The working copy is already a commit. Saving a file changes it — so there is nothing to stage, and nothing to forget to stage.",
    lead: "When one change should have been two, split it after the fact:",
    step: "Split a change by hunk",
    shortcut: "⌘⇧S",
  },
  {
    eyebrow: "BRANCHES",
    git: ["git checkout -b feat/x", "git branch -f"],
    headline: "Nothing is checked out.",
    body:
      "@ is wherever you are working; a bookmark is a name you leave on a commit. It does not follow you, and a stack of changes needs none until you push.",
    lead: "Pushing a stack mints the names and moves them for you:",
    step: "Push the stack",
    shortcut: "⇧⌘P",
  },
  {
    eyebrow: "GETTING OUT OF TROUBLE",
    git: ["git reflog", "git reset --hard ORIG_HEAD"],
    headline: "Undo is a verb here.",
    body:
      "Every command that touched the repository is one row on the strip along the bottom of the window. Drag the playhead to read any past state; nothing is written until you restore.",
    lead: "A rebase, a squash, a bad merge — all one key:",
    step: "Undo the last operation",
    shortcut: "⌘Z",
    primary: true,
  },
];

function DownArrow() {
  return (
    <svg
      viewBox="0 0 20 20"
      width={16}
      height={16}
      fill="none"
      stroke="var(--u-text-tertiary)"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10 4v12M6 12l4 4 4-4" />
    </svg>
  );
}

function ShieldCheck() {
  return (
    <svg
      viewBox="0 0 20 20"
      width={18}
      height={18}
      fill="none"
      stroke="var(--u-accent)"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10 3l6 2.5v5c0 3.4-2.4 5.8-6 6.5-3.6-.7-6-3.1-6-6.5v-5z" />
      <path d="M7.5 10l2 2 3.5-3.5" />
    </svg>
  );
}

export function Welcome({ root }: { root: string }) {
  const name = root.split("/").filter(Boolean).pop() ?? root;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        padding: "40px 60px",
        overflow: "auto",
        background: "var(--u-bg-sidebar)",
      }}
      data-tauri-drag-region
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          alignItems: "center",
          marginBottom: 34,
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>
          Three things differ. Then you are on your own.
        </div>
        <div className="sec" style={{ fontSize: 13 }}>
          Everything else, <span className="key">⌘G</span> answers when you ask it.
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 20,
          width: "100%",
          maxWidth: 1240,
        }}
      >
        {CARDS.map((card) => (
          <div
            key={card.eyebrow}
            style={{
              display: "flex",
              flexDirection: "column",
              background: "var(--u-bg-raised)",
              border: "1px solid var(--u-line)",
              borderRadius: "var(--u-radius-lg)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: "16px 18px 14px",
                background: "var(--u-bg-sunken)",
              }}
            >
              <div className="side-head" style={{ padding: 0 }}>
                {card.eyebrow}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {card.git.map((line) => (
                  <div key={line} className="mono ter" style={{ fontSize: 12.5 }}>
                    {line}
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 26,
                background: "var(--u-bg-sunken)",
              }}
            >
              <DownArrow />
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                padding: "16px 18px 18px",
                flexGrow: 1,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 600 }}>{card.headline}</div>
              <div className="sec" style={{ lineHeight: 1.6, flexGrow: 1 }}>
                {card.body}
              </div>
              <div className="sec" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                {card.lead}
              </div>
              {/* Not a button: these keys need a repository open, and a control
                  that looks live but is not would be its own small lie. */}
              <div className="step" {...(card.primary ? { "data-variant": "primary" } : {})}>
                <span>{card.step}</span>
                <span className="key">{card.shortcut}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* The one sentence that decides whether a Git user dares experiment. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "100%",
          maxWidth: 1240,
          marginTop: 26,
          padding: "14px 18px",
          borderRadius: "var(--u-radius-lg)",
          background: "var(--u-accent-soft)",
        }}
      >
        <ShieldCheck />
        <div style={{ color: "var(--u-accent)", fontWeight: 500 }}>
          Anything you do in this window is one{" "}
          <span
            className="key"
            style={{
              background: "rgba(10,132,255,0.14)",
              borderColor: "rgba(10,132,255,0.22)",
              color: "var(--u-accent)",
            }}
          >
            ⌘Z
          </span>{" "}
          away. That is deliberate — you are meant to be able to make a mess.
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "100%",
          maxWidth: 1240,
          marginTop: 22,
        }}
      >
        <button
          type="button"
          className="tb-btn"
          data-variant="primary"
          autoFocus
          onClick={markWelcomed}
        >
          Open {name} <span className="key">⏎</span>
        </button>
        <span className="sec" style={{ fontSize: 12 }}>
          Or look any of it up again later with <span className="key">⌘G</span>
        </span>
      </div>
    </div>
  );
}

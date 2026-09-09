import { StrictMode, useEffect, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App.tsx";
import {
  gitProbe,
  initColocate,
  initialRepo,
  isJjRepo,
  pickRepoFolder,
  recentRepos,
  rememberedRepo,
  rememberRepo,
  type GitProbe,
} from "./jj.ts";
import { Welcome } from "./ui/Welcome.tsx";
import { progressSnapshot, subscribeProgress } from "./ui/onboarding.ts";
import { applyTheme, THEMES } from "./themes/themes.ts";
import { applyLocale, currentLocale, initialLocale, subscribeLocale, t, tParts } from "./i18n/i18n.ts";
import "./themes/contract.css";

const client = new QueryClient({
  defaultOptions: {
    queries: {
      // A read keyed on an operation ID is immutable, so retrying a *failed*
      // one is the only retry that makes sense — and a bad revset should fail
      // fast rather than three times.
      retry: false,
      refetchOnWindowFocus: true,
    },
  },
});

/** A Git repository the user picked that has no jj in it yet. */
interface ColocateOffer {
  readonly path: string;
  readonly probe: GitProbe;
}

const folderName = (path: string) => path.split("/").filter(Boolean).pop() ?? path;

/** One row of the "what changes" table: a verdict, a path, and what it means. */
function Consequence({
  verdict,
  tone,
  subject,
  children,
}: {
  verdict: string;
  tone: "new" | "safe" | "plain";
  subject: string;
  children: string;
}) {
  const pillStyle =
    tone === "new"
      ? { background: "var(--u-accent-soft)", color: "var(--u-accent)" }
      : tone === "safe"
        ? { background: "var(--u-added-soft)", color: "var(--u-added)" }
        : {};
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "88px 132px minmax(0, 1fr)",
        alignItems: "center",
        gap: 10,
        minHeight: 30,
        padding: "4px 4px",
        borderRadius: "var(--u-radius)",
        ...(tone === "new" ? { background: "var(--u-bg-sunken)" } : {}),
      }}
    >
      <span className="pill" style={pillStyle}>
        {verdict}
      </span>
      <span className="mono">{subject}</span>
      <span className="sec">{children}</span>
    </div>
  );
}

/**
 * Repository picker — and, for a Git repo with no jj, the way in.
 *
 * This screen used to be a dead end: a Git user's first move is to open their
 * Git repository, and "not inside a jj repository" is where they left. The
 * offer below is the whole onboarding path, so it spends its space on the one
 * question that decides whether they take it — what happens to `.git` —
 * and shows the command it will run, unedited.
 */
function OpenRepo({
  offer,
  problem,
  busy,
  onPick,
  onColocate,
}: {
  offer?: ColocateOffer | undefined;
  problem?: string | undefined;
  busy: boolean;
  onPick(): void;
  onColocate(): void;
}) {
  const [checkedOutBefore, checkedOutAfter] = tParts(
    "A Git repository with no jj in it — {branch} is checked out.",
    "branch",
  );
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        padding: "0 40px",
        background: "var(--u-bg-sidebar)",
      }}
      data-tauri-drag-region
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20, width: 640 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>Ukemi</div>
          <div className="sec" style={{ fontSize: 12 }}>
            {t("A desktop window on Jujutsu")}
          </div>
        </div>

        {!offer && (
          <div
            className="sec"
            style={{ maxWidth: 420, alignSelf: "center", textAlign: "center", lineHeight: 1.55 }}
          >
            {t("Open a jj repository — or a Git one, and jj can go alongside it.")}
          </div>
        )}

        {offer && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              background: "var(--u-bg-raised)",
              border: "1px solid var(--u-line-strong)",
              borderRadius: "var(--u-radius-lg)",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "14px 16px" }}>
              <RepoGlyph />
              <div
                style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, flexGrow: 1 }}
              >
                <div style={{ fontSize: 15, fontWeight: 600 }}>{folderName(offer.path)}</div>
                <div className="sec mono" style={{ fontSize: 11 }}>
                  {offer.path}
                </div>
              </div>
              <span className="pill">{t("git only")}</span>
            </div>

            <div style={{ height: 1, background: "var(--u-line-faint)" }} />

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                padding: "14px 16px 16px",
              }}
            >
              <div style={{ lineHeight: 1.55 }}>
                {offer.probe.branch ? (
                  <>
                    {checkedOutBefore}
                    <span className="mono">{offer.probe.branch}</span>
                    {checkedOutAfter}
                  </>
                ) : (
                  t("A Git repository with no jj in it — on a detached HEAD.")
                )}{" "}
                {t(
                  "Anything you have not committed becomes the working-copy change; nothing is lost.",
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  className="tb-btn"
                  data-variant="primary"
                  onClick={onColocate}
                  disabled={busy}
                >
                  {busy ? t("Adding jj…") : t("Add jj alongside Git")}{" "}
                  <span className="key">⏎</span>
                </button>
                <button type="button" className="tb-btn" onClick={onPick} disabled={busy}>
                  {t("Choose another folder…")} <span className="key">⌘O</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {offer && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="side-head" style={{ padding: "0 0 2px" }}>
              {t("WHAT CHANGES, AND WHAT DOES NOT")}
            </div>
            <Consequence verdict={t("new")} tone="new" subject=".jj/">
              {t("The operation log and this window’s working copy live here.")}
            </Consequence>
            <Consequence verdict={t("untouched")} tone="safe" subject=".git/">
              {t("No commit is rewritten. Branches, tags and remotes stay as they are.")}
            </Consequence>
            <Consequence verdict={t("untouched")} tone="safe" subject={t("git, your IDE")}>
              {t("Both tools read the same commits. Keep a terminal open beside this window.")}
            </Consequence>
            <Consequence verdict={t("reversible")} tone="plain" subject="rm -rf .jj">
              {t("Deletes the jj side and leaves the Git repository you started with.")}
            </Consequence>
          </div>
        )}

        {offer && (
          // Transparency is the app's standing promise (design §4.8), and the
          // first command it ever runs on a repo is the one most worth showing.
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: "var(--u-radius)",
              border: "1px solid var(--u-line-faint)",
              background: "var(--u-bg-raised)",
            }}
          >
            <span className="side-head" style={{ padding: 0, whiteSpace: "nowrap" }}>
              {t("RUNS")}
            </span>
            <span className="mono selectable" style={{ flexGrow: 1 }}>
              jj git init --colocate
            </span>
          </div>
        )}

        {problem && (
          <div
            role="alert"
            className="mono selectable"
            style={{
              color: "var(--u-conflict)",
              fontSize: 12,
              textAlign: "center",
              whiteSpace: "pre-wrap",
            }}
          >
            {problem}
          </div>
        )}

        {!offer && (
          <button
            type="button"
            className="tb-btn"
            data-variant="primary"
            style={{ alignSelf: "center" }}
            onClick={onPick}
            disabled={busy}
          >
            {t("Choose folder…")} <span className="key">⌘O</span>
          </button>
        )}
      </div>
    </div>
  );
}

function RepoGlyph() {
  return (
    <svg
      viewBox="0 0 20 20"
      width={20}
      height={20}
      fill="none"
      stroke="var(--u-text-secondary)"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2.5" y="4" width="15" height="12" rx="2.5" />
      <path d="M7.5 4v12" />
    </svg>
  );
}

function Root() {
  const [root, setRoot] = useState<string | undefined>(undefined);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [offer, setOffer] = useState<ColocateOffer | undefined>(undefined);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const progress = useSyncExternalStore(subscribeProgress, progressSnapshot);
  // Re-rendering from here is what repaints every string below; the key on the
  // window makes that unconditional rather than dependent on nothing being
  // memoised between here and the leaf that reads the catalogue.
  const locale = useSyncExternalStore(subscribeLocale, currentLocale);

  const open = (candidate: string) => {
    setProblem(undefined);
    setOffer(undefined);
    setRoot(candidate);
    rememberRepo(candidate);
  };

  /**
   * Verify a candidate, and decide which of the three answers it is: a jj
   * repository, a Git repository we can offer to colocate, or neither.
   */
  const openRoot = async (candidate: string) => {
    setChecking(true);
    try {
      if (await isJjRepo(candidate)) {
        open(candidate);
        return;
      }
      const probe = await gitProbe(candidate);
      setRoot(undefined);
      if (probe) {
        setProblem(undefined);
        setOffer({ path: candidate, probe });
      } else {
        setOffer(undefined);
        setProblem(t("{path} is not inside a jj or Git repository.", { path: candidate }));
      }
    } finally {
      setChecking(false);
    }
  };

  const pick = () => {
    void pickRepoFolder().then((chosen) => chosen && void openRoot(chosen));
  };

  const colocate = () => {
    if (!offer) return;
    setBusy(true);
    initColocate(offer.path)
      .then(() => open(offer.path))
      // jj's own stderr, verbatim: it is written for humans, and this is
      // exactly the moment a wary user needs the real reason.
      .catch((error: unknown) => setProblem(messageFor(error)))
      .finally(() => setBusy(false));
  };

  // A repo on the command line wins over the remembered one; either way it is
  // verified, because a folder can be moved or de-initialised between launches.
  useEffect(() => {
    void initialRepo().then(async (fromArgv) => {
      const candidate = fromArgv ?? rememberedRepo();
      if (!candidate) {
        setChecking(false);
        return;
      }
      if (await isJjRepo(candidate)) {
        setChecking(false);
        open(candidate);
        return;
      }
      // An explicit argument deserves the full answer — including the offer, so
      // `ukemi ~/some-git-repo` is a way in and not an error.
      if (fromArgv) await openRoot(fromArgv);
      else setChecking(false);
    });
  }, []);

  useEffect(() => {
    applyTheme(rememberedTheme());
    applyLocale(initialLocale());
  }, []);

  // ⌘O works from the empty state too, before any repo is open. Return also
  // takes the offer, since it is the one primary action on screen.
  useEffect(() => {
    if (root) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        pick();
      }
      if (event.key === "Enter" && offer && !busy) {
        event.preventDefault();
        colocate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (checking && !offer) {
    return <div style={{ height: "100%", background: "var(--u-bg-sidebar)" }} />;
  }
  if (!root) {
    return (
      <OpenRepo
        busy={busy}
        onPick={pick}
        onColocate={colocate}
        {...(offer ? { offer } : {})}
        {...(problem ? { problem } : {})}
      />
    );
  }
  // The three cards come between opening a repo and seeing it, once ever: they
  // are what makes the first graph readable rather than alarming.
  if (!progress.welcomed) return <Welcome key={locale} root={root} />;
  return (
    <App
      key={locale}
      root={root}
      recents={recentRepos()}
      onOpenRepo={(path) => (path ? void openRoot(path) : pick())}
    />
  );
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The theme to load at launch. Falls back to the first built-in. */
function rememberedTheme(): string {
  try {
    const stored = localStorage.getItem("ukemi:theme");
    if (stored && THEMES.some((theme) => theme.id === stored)) return stored;
  } catch {
    // Blocked storage: the default theme is a fine answer.
  }
  return THEMES[0]!.id;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <Root />
    </QueryClientProvider>
  </StrictMode>,
);

import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App.tsx";
import {
  initialRepo,
  isJjRepo,
  pickRepoFolder,
  rememberedRepo,
  rememberRepo,
} from "./jj.ts";
import { applyTheme, THEMES } from "./themes/themes.ts";
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

/** Repository picker, shown before a repo is open and when one is invalid. */
function OpenRepo({
  onOpen,
  problem,
}: {
  onOpen(root: string): void;
  problem?: string;
}) {
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    setBusy(true);
    try {
      const chosen = await pickRepoFolder();
      if (chosen) onOpen(chosen);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        height: "100%",
        background: "var(--u-bg-sidebar)",
      }}
      data-tauri-drag-region
    >
      <div style={{ fontSize: 22, fontWeight: 600 }}>Ukemi</div>
      <div className="sec" style={{ maxWidth: 380, textAlign: "center", lineHeight: 1.5 }}>
        Open a jj repository. In a colocated repo, jj and git share the same
        data, so a terminal can stay open alongside this window.
      </div>
      {problem && (
        <div className="mono" style={{ color: "var(--u-conflict)", fontSize: 12 }}>
          {problem}
        </div>
      )}
      <button type="button" className="tb-btn" data-variant="primary" onClick={pick} disabled={busy}>
        Choose folder… <span className="key">⌘O</span>
      </button>
    </div>
  );
}

function Root() {
  const [root, setRoot] = useState<string | undefined>(undefined);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [checking, setChecking] = useState(true);

  const openRoot = (candidate: string) => {
    setChecking(true);
    void isJjRepo(candidate).then((valid) => {
      setChecking(false);
      if (valid) {
        setProblem(undefined);
        setRoot(candidate);
        rememberRepo(candidate);
      } else {
        setProblem(`${candidate} is not inside a jj repository.`);
        setRoot(undefined);
      }
    });
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
      const valid = await isJjRepo(candidate);
      setChecking(false);
      if (valid) {
        setRoot(candidate);
        rememberRepo(candidate);
      } else if (fromArgv) {
        // An explicit argument that is wrong deserves to be said out loud.
        setProblem(`${fromArgv} is not inside a jj repository.`);
      }
    });
  }, []);

  useEffect(() => {
    applyTheme(rememberedTheme());
  }, []);

  // ⌘O works from the empty state too, before any repo is open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o" && !root) {
        event.preventDefault();
        void pickRepoFolder().then((chosen) => chosen && openRoot(chosen));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [root]);

  if (checking) return <div style={{ height: "100%", background: "var(--u-bg-sidebar)" }} />;
  if (!root) {
    return <OpenRepo onOpen={openRoot} {...(problem ? { problem } : {})} />;
  }
  return (
    <App
      root={root}
      onOpenRepo={() => void pickRepoFolder().then((chosen) => chosen && openRoot(chosen))}
    />
  );
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

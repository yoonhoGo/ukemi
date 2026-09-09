import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import type {
  Bookmark,
  ChangeId,
  CommandRecord,
  ConflictedFile,
  FileChange,
  ForgePort,
  GitInfo,
  JjPort,
  Operation,
  OperationId,
  PullRequest,
  Revision,
  RevsetAlias,
  RevsetFunction,
  Workspace,
} from "@ukemi/domain";
import {
  layoutGraph,
  withLimit,
  parseGitDiff,
  rebaseSetRevset,
  verifyRoundTrip,
  type FileDiff,
  type GraphLayout,
  type RebaseMode,
} from "@ukemi/domain";
import { githubSlug } from "@ukemi/jj-cli-adapter";
import { t } from "./i18n/i18n.ts";
import {
  commandLogSnapshot,
  forgeFor,
  portFor,
  rememberRepo,
  subscribeCommands,
} from "./jj.ts";

/**
 * Repo state and the query layer.
 *
 * There is no global store, by design: the server cache *is* the state, and
 * every read is keyed on `(opId, revset)`. That key is the load-bearing idea —
 * an operation ID names an immutable point in the repo's history, so a cached
 * read can never be stale for its key, and the operation scrubber is nothing
 * more than changing which opId the whole window reads at.
 *
 * The only local state is the pin: `undefined` follows the repo head, a value
 * parks the window in the past.
 */

interface RepoValue {
  readonly root: string;
  readonly port: JjPort;
  /** The operation every read is pinned to; `undefined` until the head loads. */
  readonly opId: OperationId | undefined;
  /** Set when the scrubber has parked the window in the past. */
  readonly pinnedOpId: OperationId | undefined;
  readonly isPinned: boolean;
  pin(opId: OperationId | undefined): void;
  readonly revset: string;
  setRevset(revset: string): void;
  /**
   * What the revset field currently *reads*, which is not yet what the window
   * is showing — the field applies on ⏎, never per keystroke.
   *
   * It lives here rather than inside `RevsetField` because the ⌘K palette
   * writes into it: choosing a row completes the word being typed and leaves
   * the applying to the field, so the two need one string between them.
   */
  readonly revsetDraft: string;
  setRevsetDraft(draft: string): void;
}

const RepoContext = createContext<RepoValue | undefined>(undefined);

export function RepoProvider({
  root,
  initialRevset,
  children,
}: {
  root: string;
  initialRevset: string;
  children: ReactNode;
}) {
  const [pinnedOpId, setPinnedOpId] = useState<OperationId | undefined>(undefined);
  const [revset, setRevsetState] = useState(initialRevset);
  const [revsetDraft, setRevsetDraft] = useState(initialRevset);
  const port = useMemo(() => portFor(root), [root]);

  // Applying a revset also settles the field: a sidebar row or ⌘4 must not
  // leave a stale half-typed draft sitting in the toolbar.
  const setRevset = useCallback((next: string) => {
    setRevsetState(next);
    setRevsetDraft(next);
  }, []);

  // The repo head. Everything else keys off the resolved opId, so this one
  // query is the single point that decides "when" the window is looking at.
  const head = useQuery({
    queryKey: ["op-head", root],
    queryFn: () => port.currentOperation(),
    // Refetched on window focus (React Query's default), which is what keeps
    // the window honest when the user runs jj in a terminal and comes back.
    // ponytail: no fs watcher yet — add one on .jj/repo/op_heads/ if focus
    // refetching proves too coarse in daily use.
    staleTime: 0,
  });

  const value = useMemo<RepoValue>(
    () => ({
      root,
      port,
      opId: pinnedOpId ?? head.data,
      pinnedOpId,
      isPinned: pinnedOpId !== undefined,
      pin: setPinnedOpId,
      revset,
      setRevset,
      revsetDraft,
      setRevsetDraft,
    }),
    [root, port, pinnedOpId, head.data, revset, setRevset, revsetDraft],
  );

  return <RepoContext.Provider value={value}>{children}</RepoContext.Provider>;
}

export function useRepo(): RepoValue {
  const value = useContext(RepoContext);
  if (!value) throw new Error("useRepo must be used inside a RepoProvider");
  return value;
}

/** Reads are disabled until the opId resolves, so nothing runs unpinned. */
function useRepoQuery<T>(
  key: readonly unknown[],
  run: (port: JjPort, opId: OperationId) => Promise<T>,
): UseQueryResult<T> {
  const { root, port, opId } = useRepo();
  return useQuery({
    queryKey: ["repo", root, opId, ...key],
    queryFn: () => run(port, opId!),
    enabled: opId !== undefined,
    // A read at a given opId can never change: that point in history is
    // immutable, so the cache entry is valid until it is evicted.
    staleTime: Infinity,
  });
}

/**
 * Rows the graph will draw at most.
 *
 * Measured on jj's own repo (15k commits): `jj log -r all()` through the
 * adapter is 265 ms, so the CLI is not the ceiling — painting 15k rows is.
 * `latest(…, N)` keeps the newest, which is what a revset that wide is asking
 * to see first. ponytail: virtual scrolling is the upgrade if 1000 rows is
 * ever too few.
 */
export const LOG_LIMIT = 1000;

export function useLog(): UseQueryResult<Revision[]> {
  const { revset } = useRepo();
  return useRepoQuery(["log", revset, LOG_LIMIT], (port, opId) =>
    port.log(withLimit(revset, LOG_LIMIT), { atOp: opId }),
  );
}

/** The graph layout for the current revset. Pure, so it is derived, not fetched. */
export function useGraph(): { layout: GraphLayout | undefined; query: UseQueryResult<Revision[]> } {
  const query = useLog();
  const layout = useMemo(
    () => (query.data ? layoutGraph(query.data) : undefined),
    [query.data],
  );
  return { layout, query };
}

export function useBookmarks(): UseQueryResult<Bookmark[]> {
  return useRepoQuery(["bookmarks"], (port, opId) => port.bookmarks({ atOp: opId }));
}

export function useWorkspaces(): UseQueryResult<Workspace[]> {
  return useRepoQuery(["workspaces"], (port, opId) => port.workspaces({ atOp: opId }));
}

/**
 * The revsets the user has named, and the two calls that change that list.
 *
 * Not a `useRepoQuery`: config sits outside the operation log, so there is no
 * opId to key on and nothing that makes a cached entry immutable — the user can
 * edit `.jj/repo/config.toml` in a terminal. Keyed on the root and invalidated
 * by its own mutations; a focus refetch is React Query's default and covers the
 * terminal case the same way the op head does.
 *
 * The mutations deliberately do *not* go through `useJjMutation`: that hook
 * releases the operation pin and invalidates the head, which is right for
 * anything that rewrites history and wrong here. Naming a revset while parked
 * in the past must not throw the window back to the present.
 */
export function useRevsetAliases(): UseQueryResult<RevsetAlias[]> {
  const { root, port } = useRepo();
  return useQuery({
    queryKey: ["revset-aliases", root],
    queryFn: () => port.revsetAliases(),
  });
}

export function useRevsetFunctions(): UseQueryResult<RevsetFunction[]> {
  const { port } = useRepo();
  return useQuery({
    queryKey: ["revset-functions"],
    queryFn: () => port.revsetFunctions(),
    // The binary cannot change under a running window, so this is the one read
    // that is fetched once and never again.
    staleTime: Infinity,
  });
}

export function useSaveRevsetAlias() {
  const { root, port } = useRepo();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { name: string; revset: string }) =>
      port.saveRevsetAlias(args.name, args.revset),
    onSuccess: () => client.invalidateQueries({ queryKey: ["revset-aliases", root] }),
  });
}

export function useDeleteRevsetAlias() {
  const { root, port } = useRepo();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => port.deleteRevsetAlias(name),
    onSuccess: () => client.invalidateQueries({ queryKey: ["revset-aliases", root] }),
  });
}

/**
 * The operation log.
 *
 * Read at the repo *head*, never at the pin: the timeline must keep showing
 * the operations after the parked point, or the scrubber would erase the
 * future it is meant to let you walk back to.
 */
export function useOperations(limit = 100): UseQueryResult<Operation[]> {
  const { root, port } = useRepo();
  const head = useQuery({
    queryKey: ["op-head", root],
    queryFn: () => port.currentOperation(),
  });
  return useQuery({
    queryKey: ["operations", root, head.data, limit],
    queryFn: () => port.operations(limit),
    enabled: head.data !== undefined,
    staleTime: Infinity,
  });
}

export function useDiffSummary(rev: string | undefined): UseQueryResult<FileChange[]> {
  const { root, port, opId } = useRepo();
  return useQuery({
    queryKey: ["repo", root, opId, "diff-summary", rev],
    queryFn: () => port.diffSummary(rev!, { atOp: opId }),
    enabled: opId !== undefined && rev !== undefined,
    staleTime: Infinity,
  });
}

export function useFileDiff(
  rev: string | undefined,
  path: string | undefined,
  /** Lines of unchanged code around each change; jj's default of 3 when unset. */
  context?: number,
): UseQueryResult<string> {
  const { root, port, opId } = useRepo();
  return useQuery({
    // `context` is part of the key: a wider read is a different diff, and the
    // narrow one stays cached for when the reader collapses it again.
    queryKey: ["repo", root, opId, "diff", rev, path, context],
    queryFn: () => port.diff(rev!, path, { atOp: opId, context }),
    enabled: opId !== undefined && rev !== undefined,
    staleTime: Infinity,
  });
}

/**
 * The one place a failure is turned into a line of text.
 *
 * `JjError` carries jj's own stderr as its `message`, so everything that
 * shells out already reads as the tool's own prose — there is nothing to
 * paraphrase, and the `Error` branch covers it along with everything else.
 */
export function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs a write and moves the window onto the operation it produced.
 *
 * Two things must happen together: the pin is released (a write means you are
 * working in the present, not inspecting the past) and the head query is
 * invalidated. Because reads are keyed on opId, the new head key misses the
 * cache and the whole window refetches at the new point in time — no manual
 * per-query invalidation, and no window that half-updates.
 */
export function useJjMutation<TArgs, TResult = unknown>(
  run: (port: JjPort, args: TArgs) => Promise<TResult>,
) {
  const { root, port, pin } = useRepo();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: TArgs) => run(port, args),
    onSuccess: () => {
      pin(undefined);
      void client.invalidateQueries({ queryKey: ["op-head", root] });
    },
  });
}

/** Persist the repo choice once it has actually opened. */
export function useRememberRepo(root: string): void {
  const remember = useCallback(() => rememberRepo(root), [root]);
  useMemo(remember, [remember]);
}

/**
 * Which revisions each rebase mode would move, for the drag preview.
 *
 * Asks jj rather than deriving it from the on-screen graph: the visible revset
 * may not contain every descendant, so a locally computed count could
 * understate how much history is about to move — and the number in the HUD is
 * the whole reason the preview is worth showing.
 *
 * Keyed like every other read, so dragging back and forth over the same target
 * is free after the first look.
 */
export function useRebasePreview(
  rev: ChangeId | undefined,
  onto: ChangeId | undefined,
): Record<RebaseMode, ChangeId[] | undefined> {
  const { root, port, opId } = useRepo();
  const enabled = opId !== undefined && rev !== undefined && onto !== undefined;

  const useMode = (mode: RebaseMode) =>
    useQuery({
      queryKey: ["repo", root, opId, "rebase-preview", mode, rev, onto],
      queryFn: () =>
        port
          .log(rebaseSetRevset(mode, rev!, onto!), { atOp: opId })
          .then((revisions) => revisions.map((revision) => revision.changeId)),
      enabled,
      staleTime: Infinity,
      // A revset that cannot resolve (dropping onto a descendant) is a normal
      // outcome of hovering, not something to retry or surface as an error.
      retry: false,
    });

  return {
    revision: useMode("revision").data,
    source: useMode("source").data,
    branch: useMode("branch").data,
  };
}

/** Everything the split/squash sheet needs about one revision's changes. */
export interface HunkEditData {
  readonly files: readonly FileDiff[];
  /** Content before the change, by path. Absent for binary files. */
  readonly before: ReadonlyMap<string, string>;
  /** Content after the change, by path. Absent for binary files. */
  readonly after: ReadonlyMap<string, string>;
  /** Set when a file's diff could not be accounted for; blocks the operation. */
  readonly problem?: string | undefined;
}

/**
 * Load a revision's diff along with both sides of every text file, and check
 * that partial application can reproduce them exactly.
 *
 * Verifying on open rather than on submit is deliberate: if the parser cannot
 * account for a diff, the user should find out while the sheet is harmless, not
 * after pressing Split. jj would faithfully commit whatever tree we hand it.
 */
export function useHunkEditData(rev: ChangeId | undefined): UseQueryResult<HunkEditData> {
  const { root, port, opId } = useRepo();
  return useQuery({
    queryKey: ["repo", root, opId, "hunk-edit", rev],
    enabled: opId !== undefined && rev !== undefined,
    staleTime: Infinity,
    queryFn: async (): Promise<HunkEditData> => {
      const revision = await port.show(rev!, { atOp: opId });
      if (!revision) throw new Error(`revision ${rev} not found`);
      const parent = revision.parents[0];
      const files = parseGitDiff(await port.diff(rev!, undefined, { atOp: opId }));

      const before = new Map<string, string>();
      const after = new Map<string, string>();
      let problem: string | undefined;

      for (const file of files) {
        if (file.isBinary) continue;
        // A file this change added has no "before"; one it removed has no
        // "after". Asking jj for either would just be an error.
        const left =
          file.status === "added" || parent === undefined
            ? ""
            : await port.fileContent(parent, file.oldPath ?? file.path, { atOp: opId });
        const right =
          file.status === "removed"
            ? ""
            : await port.fileContent(rev!, file.path, { atOp: opId });
        before.set(file.path, left);
        after.set(file.path, right);

        const check = verifyRoundTrip(left, right, file);
        if (!check.ok && problem === undefined) problem = check.reason;
      }

      return { files, before, after, ...(problem ? { problem } : {}) };
    },
  });
}

/** Conflicted files in a revision. Empty for a clean one, never an error. */
export function useConflicts(rev: ChangeId | undefined): UseQueryResult<ConflictedFile[]> {
  const { root, port, opId } = useRepo();
  return useQuery({
    queryKey: ["repo", root, opId, "conflicts", rev],
    queryFn: () => port.conflicts(rev!, { atOp: opId }),
    enabled: opId !== undefined && rev !== undefined,
    staleTime: Infinity,
  });
}

/** Every CLI call this window made, oldest first. */
export function useCommandLog(): readonly CommandRecord[] {
  return useSyncExternalStore(subscribeCommands, commandLogSnapshot);
}

/** Git dir, colocation, remotes. About the repo, not a point in time, so unpinned. */
export function useGitInfo(): UseQueryResult<GitInfo> {
  const { root, port } = useRepo();
  return useQuery({
    queryKey: ["git-info", root],
    queryFn: () => port.gitInfo(),
    staleTime: 5 * 60_000,
  });
}

/**
 * The forge behind the first GitHub remote, or `undefined` when there is none.
 * `undefined` is a normal state (GitLab, no remote, no gh) and every PR feature
 * degrades to "push only" on it rather than showing an error.
 */
export function useForge(): ForgePort | undefined {
  const { root } = useRepo();
  const info = useGitInfo();
  const slug = info.data?.remotes.map((remote) => githubSlug(remote.url)).find(Boolean);
  return useMemo(() => (slug ? forgeFor(root, slug) : undefined), [root, slug]);
}

/**
 * Pull requests on the forge. Not keyed on opId — the forge is not part of the
 * repo's history — and allowed to go stale for a minute, since a review
 * decision changing under us is not the kind of staleness that misleads.
 */
export function usePullRequests(): UseQueryResult<PullRequest[]> {
  const forge = useForge();
  return useQuery({
    queryKey: ["prs", forge?.slug],
    queryFn: () => forge!.pullRequests(),
    enabled: forge !== undefined,
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * Runs a forge write and refreshes both the PR list and the repo head, since
 * opening a PR is usually preceded by a push.
 */
export function useForgeMutation<TArgs>(run: (forge: ForgePort, args: TArgs) => Promise<unknown>) {
  const forge = useForge();
  const { root } = useRepo();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: TArgs) => {
      if (!forge) throw new Error(t("No GitHub remote, or gh is not available."));
      return run(forge, args);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["prs"] });
      void client.invalidateQueries({ queryKey: ["op-head", root] });
    },
  });
}

/**
 * Revisions for the workspace board: every workspace's working copy plus the
 * mutable ancestors it sits on, in one read.
 */
export function useBoardRevisions(
  workspaces: readonly Workspace[] | undefined,
): UseQueryResult<Revision[]> {
  const ids = workspaces?.map((workspace) => workspace.changeId) ?? [];
  const revset = ids.length > 0 ? `(${ids.join(" | ")}) | (::(${ids.join(" | ")}) & mutable())` : "none()";
  return useRepoQuery(["board", revset], (port, opId) => port.log(revset, { atOp: opId }));
}

/** The bookmark on `trunk()`, for PR bases. `undefined` while loading or if unnamed. */
export function useTrunkBookmark(): string | undefined {
  const trunk = useRepoQuery(["trunk"], (port, opId) => port.show("trunk()", { atOp: opId }));
  return trunk.data?.bookmarks[0];
}

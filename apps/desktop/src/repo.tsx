import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
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
  FileChange,
  JjPort,
  Operation,
  OperationId,
  Revision,
  Workspace,
} from "@ukemi/domain";
import { layoutGraph, rebaseSetRevset, type GraphLayout, type RebaseMode } from "@ukemi/domain";
import { portFor, rememberRepo } from "./jj.ts";

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
  const [revset, setRevset] = useState(initialRevset);
  const port = useMemo(() => portFor(root), [root]);

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
    }),
    [root, port, pinnedOpId, head.data, revset],
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

export function useLog(): UseQueryResult<Revision[]> {
  const { revset } = useRepo();
  return useRepoQuery(["log", revset], (port, opId) => port.log(revset, { atOp: opId }));
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
): UseQueryResult<string> {
  const { root, port, opId } = useRepo();
  return useQuery({
    queryKey: ["repo", root, opId, "diff", rev, path],
    queryFn: () => port.diff(rev!, path, { atOp: opId }),
    enabled: opId !== undefined && rev !== undefined,
    staleTime: Infinity,
  });
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
export function useJjMutation<TArgs>(
  run: (port: JjPort, args: TArgs) => Promise<unknown>,
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

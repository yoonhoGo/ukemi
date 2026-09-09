import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeId, RebaseMode } from "@ukemi/domain";

/**
 * Drag-to-rebase state.
 *
 * The gesture needs ⌥ held to start, which is what keeps an ordinary click or
 * a scroll-drag on the graph from rewriting history by accident. The status bar
 * carries the hint, so the requirement is discoverable rather than hidden.
 */
export interface DragState {
  readonly rev: ChangeId;
  /** Row under the pointer, if it is a row at all. */
  readonly onto: ChangeId | undefined;
  readonly mode: RebaseMode;
  readonly x: number;
  readonly y: number;
}

/** Rows carry this attribute so the pointer can be mapped back to a revision. */
export const ROW_ATTRIBUTE = "data-change-id";

const MODE_KEYS: Record<string, RebaseMode> = {
  r: "revision",
  s: "source",
  b: "branch",
};

/**
 * The row under the pointer, if it is a row at all.
 *
 * elementFromPoint rather than per-row pointerenter: the drag holds implicit
 * capture on the element it started from, so enter events on the other rows
 * never fire.
 */
function rowUnder(x: number, y: number): ChangeId | undefined {
  const element = document.elementFromPoint(x, y);
  const row = element?.closest(`[${ROW_ATTRIBUTE}]`);
  return row?.getAttribute(ROW_ATTRIBUTE) ?? undefined;
}

export function useDragRebase(onDrop: (drag: DragState) => void) {
  const [drag, setDrag] = useState<DragState | undefined>(undefined);
  // The handlers are bound once per drag, so they read the live drag through a
  // ref rather than closing over a stale value.
  const current = useRef<DragState | undefined>(undefined);
  current.current = drag;

  const start = useCallback((rev: ChangeId, event: React.PointerEvent) => {
    if (!event.altKey) return;
    event.preventDefault();
    setDrag({ rev, onto: undefined, mode: "revision", x: event.clientX, y: event.clientY });
  }, []);

  const cancel = useCallback(() => setDrag(undefined), []);

  useEffect(() => {
    if (!drag) return;

    const onMove = (event: PointerEvent) => {
      const onto = rowUnder(event.clientX, event.clientY);
      setDrag((previous) =>
        previous
          ? { ...previous, x: event.clientX, y: event.clientY, ...(onto ? { onto } : { onto: undefined }) }
          : previous,
      );
    };

    const onUp = () => {
      const finished = current.current;
      setDrag(undefined);
      if (finished?.onto && finished.onto !== finished.rev) onDrop(finished);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDrag(undefined);
        return;
      }
      const mode = MODE_KEYS[event.key.toLowerCase()];
      if (mode) {
        // Swallow the key so the window's own map does not also act on it.
        event.preventDefault();
        event.stopPropagation();
        setDrag((previous) => (previous ? { ...previous, mode } : previous));
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    // Capture phase, so a mode key is claimed before App's window handler sees it.
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [drag, onDrop]);

  return { drag, start, cancel };
}

export interface BookmarkDragState {
  readonly name: string;
  readonly from: ChangeId;
  /** Row under the pointer, if it is a row at all. */
  readonly onto: ChangeId | undefined;
}

/**
 * Drag a bookmark pill onto another row — `jj bookmark set`.
 *
 * No modifier, unlike the rebase drag above: that gesture can start anywhere
 * on a row, so ⌥ is what tells it apart from a click. A pill is a handle you
 * have to hit on purpose, and grabbing it already says which bookmark you
 * mean. The same `ROW_ATTRIBUTE` hit-test answers where it landed.
 */
export function useDragBookmark(onDrop: (name: string, onto: ChangeId) => void) {
  const [drag, setDrag] = useState<BookmarkDragState | undefined>(undefined);
  const current = useRef<BookmarkDragState | undefined>(undefined);
  current.current = drag;

  const start = useCallback((name: string, from: ChangeId, event: React.PointerEvent) => {
    // The pill lives inside the row button: without this the same press would
    // also select the row and arm a rebase drag on it.
    event.preventDefault();
    event.stopPropagation();
    setDrag({ name, from, onto: undefined });
  }, []);

  useEffect(() => {
    if (!drag) return;

    const onMove = (event: PointerEvent) => {
      const onto = rowUnder(event.clientX, event.clientY);
      setDrag((previous) =>
        previous ? { ...previous, ...(onto ? { onto } : { onto: undefined }) } : previous,
      );
    };

    const onUp = () => {
      const finished = current.current;
      setDrag(undefined);
      // Dropping a bookmark back where it already is is not a command.
      if (finished?.onto && finished.onto !== finished.from) onDrop(finished.name, finished.onto);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDrag(undefined);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    // Capture, so Escape unwinds the drag before the window's own map sees it.
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [drag, onDrop]);

  return { drag, start };
}

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

    const rowUnder = (x: number, y: number): ChangeId | undefined => {
      // elementFromPoint rather than per-row pointerenter: the drag holds
      // implicit capture on the row it started from, so enter events on the
      // other rows never fire.
      const element = document.elementFromPoint(x, y);
      const row = element?.closest(`[${ROW_ATTRIBUTE}]`);
      return row?.getAttribute(ROW_ATTRIBUTE) ?? undefined;
    };

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

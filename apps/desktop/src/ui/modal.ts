import { useEffect, useRef, type RefObject } from "react";

/**
 * What the four overlays need to be usable without a mouse.
 *
 * ⌘/ shortcuts, the Git lookup, the progress panel and the hunk sheet all had
 * the same three holes: focus stayed behind the scrim when the sheet opened,
 * Tab walked straight out into the graph and the toolbar, and closing dropped
 * the user's place. One hook rather than four copies, because containment is
 * the kind of rule that drifts once it is written down four times — and the
 * drift is invisible until someone is driving the window from the keyboard.
 *
 * Escape is deliberately *not* here. The window's key map owns it and closes
 * the sheets in a priority order; a second Escape path would race that one.
 *
 * The returned ref goes on the panel, which also wants `tabIndex={-1}`: that
 * is what keeps a click on the panel's dead space inside the sheet instead of
 * dropping focus to the body, where Tab would have nothing to contain.
 */
export function useModal(
  initialFocus?: RefObject<HTMLElement | null>,
): RefObject<HTMLDivElement | null> {
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<Element | null>(null);

  useEffect(() => {
    // Read before we move focus: this is still whatever the user was on when
    // they pressed the key or clicked the button that opened the sheet.
    restoreTo.current = document.activeElement;
    (initialFocus?.current ?? panel.current)?.focus();
    return () => {
      // A sheet that rewrote history closed over its own trigger, so the
      // element being gone is the normal case here, not the edge one.
      const back = restoreTo.current;
      if (back instanceof HTMLElement && back.isConnected) back.focus();
    };
  }, [initialFocus]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const box = panel.current;
      // Only the sheet that focus is actually in gets to steer Tab; two open
      // sheets would otherwise both grab it and fight over the wrap.
      if (!box || !(event.target instanceof Node) || !box.contains(event.target)) return;

      // Queried on every press, never cached: every one of these panels
      // changes while it is open — the lookup filters its rows as you type,
      // the hunk list is checkable, the progress panel has a switch.
      // ponytail: the element types this codebase actually puts in a dialog,
      // and `disabled` is the only reason one of them is skipped. A dialog
      // with a link or a select in it will need this list widened.
      const candidates = box.querySelectorAll<HTMLElement>(
        "button, input, textarea, [tabindex]",
      );
      const stops = [...candidates].filter(
        (element) => !element.hasAttribute("disabled") && element.tabIndex >= 0,
      );
      if (stops.length === 0) return;

      const first = stops[0]!;
      const last = stops[stops.length - 1]!;
      const here = document.activeElement;
      const inside = here instanceof HTMLElement && stops.includes(here);
      // In the middle of the ring the browser's own order is already right;
      // the edges are the only place it would leave the sheet. Focus sitting
      // on the panel box itself — a click that landed on nothing focusable —
      // counts as an edge too.
      if (inside && here !== (event.shiftKey ? first : last)) return;
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    };
    // Capture on the window, because the hunk sheet's own handler sits there
    // and stops propagation for every key it does not use — a listener on the
    // panel would never see Tab. Listeners on the same node all still run, so
    // this does not depend on which of the two registered first.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return panel;
}

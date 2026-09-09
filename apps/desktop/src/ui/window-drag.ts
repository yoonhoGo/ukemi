/**
 * Moving the window by its toolbar, without Tauri's injected drag script.
 *
 * The window has no title bar (`titleBarStyle: "Overlay"` plus `hiddenTitle`),
 * so the toolbar *is* the title bar and has to behave like one. Tauri ships a
 * `data-tauri-drag-region` attribute for exactly this and it was what we used
 * first, but its injected `drag.js` gates every attempt on the click count:
 *
 *     e.button === 0 && (e.detail === 1 || e.detail === 2) && isDragRegion(…)
 *
 * `e.detail` is the click count, and a *failed* drag leaves the pointer where
 * it started — so the next attempt in the same spot is click 2, the one after
 * that is click 3, and from there the script refuses until the double-click
 * interval expires. One miss therefore ratchets into a run of misses, which is
 * what "it works sometimes, but more often it doesn't" actually was. The
 * geometry was never the problem; retrying was.
 *
 * So the toolbar asks for the drag itself. Same two gestures the system title
 * bar has — drag to move, double-click to zoom — and no click-count gate.
 *
 * ponytail: the exclusion list below is a `closest()` selector rather than
 * Tauri's full `isClickableElement` walk (which also reads `contenteditable`,
 * `tabindex` and the interactive ARIA roles). These are the tags this toolbar
 * actually contains; the ceiling is that a future toolbar control built from a
 * `div` with `role="button"` would become a drag handle, and the fix is to add
 * it here or mark it with `data-tauri-drag-region="false"`.
 */
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Anything that owns its own clicks, plus the explicit opt-out.
 *
 * `data-tauri-drag-region="false"` is kept as the opt-out even though nothing
 * reads the attribute for us any more: it is still the vocabulary a reader will
 * look for, and the revset field is marked with it for the same reason a button
 * is excluded — a click on a text field has one job, which is to put the caret
 * in it.
 */
const NOT_A_HANDLE = [
  "button",
  "input",
  "textarea",
  "select",
  "a",
  "[contenteditable]:not([contenteditable='false'])",
  '[data-tauri-drag-region="false"]',
].join(", ");

/**
 * Handle a mousedown on window chrome: drag, zoom, or leave it alone.
 *
 * Failures are swallowed. The same bundle runs under plain `vite` in a browser
 * where there is no window to move, and the honest degradation is a toolbar you
 * cannot drag rather than an error the user cannot act on.
 */
export function dragWindowFrom(event: React.MouseEvent<HTMLElement>): void {
  if (event.button !== 0) return;
  if (event.target instanceof Element && event.target.closest(NOT_A_HANDLE)) return;

  // macOS zooms a window on a double-click of its title bar. `detail` is only
  // read to tell the two gestures apart here, never to refuse one.
  const window = getCurrentWindow();
  const gesture = event.detail === 2 ? window.toggleMaximize() : window.startDragging();
  void gesture.catch(() => {});
}

/**
 * The macOS menu bar — submenu titles and the one item the window has no key
 * for otherwise.
 *
 * Short by obligation: a menu-bar title is a single noun and the bar is only
 * so wide. Every *command* in the menu reuses the label the shortcut sheet
 * already had, so this file stays this small — see `ui/menu.ts`.
 *
 * The standard items (Quit, Hide, Copy, Enter Full Screen…) are not here on
 * purpose: they are asked of macOS without a text, so the system supplies its
 * own already-translated wording.
 */
export const menu: Record<string, string> = {
  File: "파일",
  Edit: "편집",
  View: "보기",
  Operations: "오퍼레이션",
  Window: "창",
  Help: "도움말",
  "Settings…": "설정…",
};

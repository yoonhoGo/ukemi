/**
 * Handing a path to the rest of the desktop.
 *
 * The four things this window can do to a path that are not jj commands:
 * reveal it in the file manager, open it in whatever the system considers its
 * editor, open a terminal beside it, and add it to `.gitignore`. Every GUI the
 * README compares Ukemi to has the first three, and the README itself tells
 * people to keep a terminal open next to the window without ever opening one.
 *
 * The first three go through `tauri-plugin-opener`, which knows each
 * platform's incantation so this file does not have to. Their reach is written
 * down in `src-tauri/capabilities/default.json`, and it is deliberately wide on
 * the path axis and narrow on the program axis: a repository can live anywhere
 * on disk, so the path scope is `**`, but the only program the window may name
 * is Terminal. Everything else opens with the system default, which is the
 * user's own choice and not one this app gets to make for them.
 *
 * Ignoring a file is a real edit, so it goes through a Rust command of ours
 * instead — see `ignore_path` in `src-tauri/src/main.rs` for why it is locked
 * to one file.
 */
import { invoke } from "@tauri-apps/api/core";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";

/**
 * macOS's terminal, by the name `open -a` knows it by.
 *
 * ponytail: one hard-coded app, because macOS is the platform Ukemi ships to
 * and the capability file has to name the program anyway — a user's iTerm or
 * Ghostty would need a setting and a second scope entry. Elsewhere the name is
 * wrong, and `quietly` is what makes that a missing menu item rather than an
 * error dialog.
 */
const TERMINAL_APP = "Terminal";

/**
 * Run a native convenience, or don't.
 *
 * The same quiet degrade `installAppMenu` uses, for the same reason: the bundle
 * also runs under plain `vite` in a browser, where there is no plugin to call,
 * and on a platform where the app named above does not exist. None of these
 * change the repository, so a failure is worth nothing louder than silence.
 */
async function quietly(open: () => Promise<void>): Promise<void> {
  try {
    await open();
  } catch {
    // No Tauri, or no such app on this platform.
  }
}

/** Show the path in the file manager, selected. */
export function revealInFileManager(path: string): Promise<void> {
  return quietly(() => revealItemInDir(path));
}

/** Open the path in whatever the system opens it with. */
export function openInDefaultApp(path: string): Promise<void> {
  return quietly(() => openPath(path));
}

/** Open a terminal in `directory`. */
export function openTerminalAt(directory: string): Promise<void> {
  return quietly(() => openPath(directory, TERMINAL_APP));
}

/**
 * Add `path` to the repository's `.gitignore`, if it is not already in it.
 *
 * `path` is relative to `root`, which is what Rust checks it against. This one
 * rejects instead of degrading quietly: it is an edit the user asked for, and a
 * write that did not happen is something the caller has to be able to say.
 */
export function ignorePath(root: string, path: string): Promise<void> {
  return invoke<void>("ignore_path", { root, path });
}

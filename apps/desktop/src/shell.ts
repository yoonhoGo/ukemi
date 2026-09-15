/**
 * Handing a path to the rest of the desktop.
 *
 * The four things this window can do to a path that are not jj commands:
 * reveal it in the file manager, open it in whatever the system considers its
 * editor, open a terminal beside it, and add it to `.gitignore`. Every GUI the
 * README compares Ukemi to has the first three, and the README itself tells
 * people to keep a terminal open next to the window without ever opening one.
 *
 * All four go through a Rust command of ours. The first three are
 * `open_in_desktop`, which spells each platform's incantation with the
 * `Command::new` seam `main.rs` already has — `tauri-plugin-opener` was the
 * obvious alternative and `DECISIONS.md` says why it is not here. Every one of
 * them names a path *relative to the repository root*, because that is the only
 * shape Rust can check before it touches the disk.
 *
 * Ignoring a file is a real edit, so it is its own command — see `ignore_path`
 * in `src-tauri/src/main.rs` for why it is locked to one file.
 */
import { invoke } from "@tauri-apps/api/core";

/**
 * Run a native convenience, or don't.
 *
 * The same quiet degrade `installAppMenu` uses, for the same reason: the bundle
 * also runs under plain `vite` in a browser, where there is no command to call,
 * and on a platform where Rust has no answer for the verb — reveal and terminal
 * on Linux. None of these change the repository, so a failure is worth nothing
 * louder than silence.
 */
async function quietly(open: () => Promise<void>): Promise<void> {
  try {
    await open();
  } catch {
    // No Tauri, or nothing to run on this platform.
  }
}

/** Show `path`, relative to `root`, in the file manager, selected. */
export function revealInFileManager(root: string, path: string): Promise<void> {
  return quietly(() => invoke<void>("open_in_desktop", { root, path, how: "reveal" }));
}

/** Open `path`, relative to `root`, in whatever the system opens it with. */
export function openInDefaultApp(root: string, path: string): Promise<void> {
  return quietly(() => invoke<void>("open_in_desktop", { root, path, how: "default" }));
}

/** Open a terminal in the repository root — the empty path is the root itself. */
export function openTerminalAt(root: string): Promise<void> {
  return quietly(() => invoke<void>("open_in_desktop", { root, path: "", how: "terminal" }));
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

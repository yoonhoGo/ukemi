/**
 * The macOS menu bar.
 *
 * Built here rather than in `src-tauri/src/main.rs` for two reasons. The
 * labels come from the same `t()` catalogue as the rest of the window, so a
 * menu item and the shortcut sheet that documents it cannot disagree; and the
 * Rust side stays the dumb three-command exec seam it was designed to be.
 *
 * Apple's HIG asks that every command be reachable from the menu bar, and the
 * app has around twenty-five of them. What it does *not* ask for is a second
 * definition of each one — so no item here knows what it does. Each one
 * synthesises its own keystroke and lets `App`'s window keydown map decide,
 * which is the same path the keyboard already takes.
 *
 * Every submenu is a function rather than a constant, because the whole point
 * of building the menu in TypeScript is that it can be rebuilt in the other
 * language — a module-level `t()` would freeze the labels at import time.
 */
import { Menu } from "@tauri-apps/api/menu";
import type {
  MenuItemOptions,
  PredefinedMenuItemOptions,
  SubmenuOptions,
} from "@tauri-apps/api/menu";
import { t } from "../i18n/i18n.ts";
import { SAVED_REVSETS } from "./Sidebar.tsx";

/**
 * One command in the menu.
 *
 * `label` is the catalogue key — deliberately the same string the shortcut
 * sheet uses, so the two read identically and one entry translates both.
 * `key` and the modifier flags are what the synthetic event carries.
 */
interface Command {
  readonly label: string;
  /** The `event.key` the window's map matches on. */
  readonly key: string;
  readonly shift?: boolean;
  readonly alt?: boolean;
  /**
   * The chord macOS should bind, in muda's spelling. Omitted for a command
   * that belongs in the menu but must *not* take the keystroke — an
   * accelerator is consumed before the web view sees it, so binding one steals
   * the key from whatever text field the user is typing in.
   */
  readonly accelerator?: string;
}

/**
 * Run a command by pressing its own chord.
 *
 * ponytail: the menu carries no handlers of its own. It works because the
 * window's map reads exactly four things — `key`, `metaKey`, `shiftKey`,
 * `altKey` — and a synthesised `keydown` can carry all four. The ceiling is
 * that vocabulary: a command that needs an argument a chord cannot express (a
 * named revision, a file, a mode) has to grow a real handler here, and at that
 * point the command stops being defined in one place.
 */
function press(command: Command): void {
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: command.key,
      metaKey: true,
      shiftKey: command.shift ?? false,
      altKey: command.alt ?? false,
      bubbles: true,
      cancelable: true,
    }),
  );
}

function item(command: Command): MenuItemOptions {
  return {
    text: t(command.label),
    // `exactOptionalPropertyTypes`: an absent accelerator is an absent key,
    // not an `undefined` one.
    ...(command.accelerator === undefined ? {} : { accelerator: command.accelerator }),
    action: () => press(command),
  };
}

const SEPARATOR: PredefinedMenuItemOptions = { item: "Separator" };

/**
 * The app submenu.
 *
 * Predefined items are asked for without a `text`, so macOS supplies its own
 * wording — "Quit Ukemi", "Hide Others" and the rest, already translated by
 * the system. Writing those ourselves would mean competing with the platform's
 * own vocabulary for no gain; the cost is that they follow the *system*
 * language rather than the one picked in Settings.
 */
function appMenu(): SubmenuOptions {
  return {
    // macOS replaces the first submenu's title with the bundle name. The
    // string is a proper noun either way, so it does not go through `t()`.
    text: "Ukemi",
    items: [
      { item: { About: null } },
      SEPARATOR,
      item({ label: "Settings…", key: ",", accelerator: "CmdOrCtrl+Comma" }),
      SEPARATOR,
      { item: "Services" },
      SEPARATOR,
      { item: "Hide" },
      { item: "HideOthers" },
      { item: "ShowAll" },
      SEPARATOR,
      { item: "Quit" },
    ],
  };
}

function fileMenu(): SubmenuOptions {
  return {
    text: t("File"),
    items: [
      item({ label: "Open another repository", key: "o", accelerator: "CmdOrCtrl+O" }),
      SEPARATOR,
      item({ label: "Fetch", key: "f", shift: true, accelerator: "CmdOrCtrl+Shift+F" }),
      item({ label: "Push", key: "p", shift: true, accelerator: "CmdOrCtrl+Shift+P" }),
      SEPARATOR,
      { item: "CloseWindow" },
    ],
  };
}

/**
 * Edit keeps the system's own text commands and adds one of ours.
 *
 * `Undo` is left exactly as the platform provides it — the *text* undo. The
 * app also binds ⌘Z, to "undo the last operation", and that item lives in the
 * Operations menu with no accelerator on purpose: the description editor calls
 * `stopPropagation`, so ⌘Z inside it is the native text undo today, and an
 * app-level ⌘Z accelerator would be consumed before the textarea ever saw it —
 * taking text undo away from the one place a writer expects it. Both items are
 * at least honest about which undo they are, which is more than the default
 * menu managed.
 */
function editMenu(): SubmenuOptions {
  return {
    text: t("Edit"),
    items: [
      { item: "Undo" },
      { item: "Redo" },
      SEPARATOR,
      { item: "Cut" },
      { item: "Copy" },
      { item: "Paste" },
      { item: "SelectAll" },
      SEPARATOR,
      item({
        label: "Copy the last jj command",
        key: "c",
        alt: true,
        accelerator: "CmdOrCtrl+Alt+C",
      }),
    ],
  };
}

/**
 * The jj verbs. "Change" is the app's own noun for a commit, so it is the title.
 *
 * `items` is spelled required because `popupRowMenu` reads it back out; every
 * builder here always sets it, and `SubmenuOptions` only says it might.
 */
function changeMenu(): SubmenuOptions & Required<Pick<SubmenuOptions, "items">> {
  return {
    text: t("Change"),
    items: [
      item({ label: "New change on top of the selection", key: "n", accelerator: "CmdOrCtrl+N" }),
      item({ label: "Edit the selected change", key: "e", accelerator: "CmdOrCtrl+E" }),
      item({
        label: "Abandon the selected change",
        key: "Backspace",
        accelerator: "CmdOrCtrl+Backspace",
      }),
      SEPARATOR,
      item({ label: "Split by hunk", key: "s", shift: true, accelerator: "CmdOrCtrl+Shift+S" }),
      item({
        label: "Squash hunks into the parent",
        key: "k",
        shift: true,
        accelerator: "CmdOrCtrl+Shift+K",
      }),
      item({
        label: "Absorb into the ancestors that last touched each line",
        key: "a",
        shift: true,
        accelerator: "CmdOrCtrl+Shift+A",
      }),
      SEPARATOR,
      // Naming a change is not rewriting it, hence the separator — but one
      // verb does not earn a Bookmarks menu of its own, and the name lands on
      // the same selection every item above acts on. Moving a name is still
      // the drag; this is the only way to mint one.
      item({ label: "Set a bookmark on the selection", key: "b", accelerator: "CmdOrCtrl+B" }),
    ],
  };
}

/**
 * The same six verbs, popped up on a graph row.
 *
 * `changeMenu().items` rather than a second list: the row menu and the Change
 * menu are the same commands, and a copy of them here would be a third place
 * to keep in step with `App`'s map. Nothing is greyed out, for the reason the
 * menu bar greys nothing out — an item knows only its chord, and the window's
 * map is what decides whether a command applies right now. It stays honest
 * because a refused command is silent, not destructive.
 *
 * ponytail: a fresh menu per right-click, never freed. It cannot be built once
 * at import — the labels follow the locale — so caching it would mean tracking
 * the locale here; do that if the resource count ever shows up.
 */
export async function popupRowMenu(): Promise<void> {
  try {
    const menu = await Menu.new({ items: changeMenu().items });
    // No position argument: muda pops at the pointer, which is where the
    // right-click was.
    await menu.popup();
  } catch {
    // No Tauri, no native menu — the same quiet degrade as `installAppMenu`,
    // and for the same reason: every item in here is a keystroke as well.
  }
}

/**
 * The bookmark pill's own menu, with one item on it.
 *
 * The only menu in this file that carries a handler instead of a chord, and
 * for exactly the reason `press` names: the command's argument is a bookmark
 * name, which a synthesised keystroke has no room for. It stays one verb so
 * the exception does not spread — the pill is still dragged to move a name,
 * and ⌘B is still what mints one.
 */
export async function popupBookmarkMenu(name: string, remove: () => void): Promise<void> {
  try {
    const menu = await Menu.new({
      items: [{ text: t("Delete the bookmark {name}", { name }), action: remove }],
    });
    await menu.popup();
  } catch {
    // No Tauri, no native menu — the same quiet degrade as `popupRowMenu`.
  }
}

function viewMenu(): SubmenuOptions {
  return {
    text: t("View"),
    items: [
      item({ label: "Workspace board", key: "w", shift: true, accelerator: "CmdOrCtrl+Shift+W" }),
      item({ label: "Focus the revset field", key: "l", accelerator: "CmdOrCtrl+L" }),
      // Next to the field it fills, not beside ⌘G in Help: the palette is how
      // you write a revset, and the Git translation it shares a sheet with is
      // what you reach for when you have forgotten how to write anything.
      item({ label: "Look up a revset", key: "k", accelerator: "CmdOrCtrl+K" }),
      SEPARATOR,
      {
        text: t("Saved revsets"),
        // Bound by position, exactly as the sidebar rows and the window's map
        // are — the list is the single source for all three.
        items: SAVED_REVSETS.map((saved, index) =>
          item({
            label: saved.label,
            key: String(index + 1),
            accelerator: `CmdOrCtrl+${index + 1}`,
          }),
        ),
      },
      SEPARATOR,
      item({ label: "Reload from disk", key: "r", accelerator: "CmdOrCtrl+R" }),
      SEPARATOR,
      { item: "Fullscreen" },
    ],
  };
}

/** Time travel. The operation log is the app's premise, so it gets a menu. */
function operationsMenu(): SubmenuOptions {
  return {
    text: t("Operations"),
    items: [
      // Discoverable, deliberately not bound — see the note on `editMenu`.
      item({ label: "Undo the last operation", key: "z" }),
      item({
        label: "Restore to the parked operation",
        key: "r",
        shift: true,
        accelerator: "CmdOrCtrl+Shift+R",
      }),
      SEPARATOR,
      item({ label: "Commands this window ran", key: "j", accelerator: "CmdOrCtrl+J" }),
    ],
  };
}

function windowMenu(): SubmenuOptions {
  return {
    text: t("Window"),
    items: [{ item: "Minimize" }, { item: "Maximize" }, SEPARATOR, { item: "BringAllToFront" }],
  };
}

function helpMenu(): SubmenuOptions {
  return {
    text: t("Help"),
    items: [
      item({ label: "Shortcuts", key: "/", accelerator: "CmdOrCtrl+Slash" }),
      item({ label: "Look up a git command", key: "g", accelerator: "CmdOrCtrl+G" }),
    ],
  };
}

/**
 * Build the menu from the catalogue as it stands and install it.
 *
 * Call once per locale — `main.tsx` re-keys the tree on the locale, so a mount
 * effect in `App` is exactly that. Rebuilding beats re-labelling item by item:
 * the tree is small, and `setAsAppMenu` replaces the whole thing anyway.
 */
export async function installAppMenu(): Promise<void> {
  try {
    const menu = await Menu.new({
      items: [
        appMenu(),
        fileMenu(),
        editMenu(),
        changeMenu(),
        viewMenu(),
        operationsMenu(),
        windowMenu(),
        helpMenu(),
      ],
    });
    await menu.setAsAppMenu();
  } catch {
    // The same bundle runs under plain `vite` in a browser, where there is no
    // application menu to install. Degrade quietly, the way the forge does
    // when `gh` is missing: every command in here is a key as well, and a
    // blank window would be a much worse trade than a missing menu bar.
  }
}

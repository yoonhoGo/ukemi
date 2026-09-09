# Decisions

What the design draft (`jj-desktop-gui-설계.md` §7) left open, and what building
P0 settled. Each entry says what was actually checked, not what seemed likely.

## Resolved

**`json()` template coverage — resolved, no fallback needed.**
jj 0.43's `json()` serialises commits, lists, signatures and bookmarks. So the
adapter's wire format is one JSON object per line, and the `\0`-delimiter
fallback the draft held in reserve is unnecessary. Two gaps found in the
process: `json(self)` on a commit omits the conflict/empty/working-copy flags,
so the template composes those explicitly; and `tracking_ahead_count` *raises*
on an untracked ref, so it is guarded by `if(tracked, …)` and read via
`.lower()` because it is a size hint, not an integer.

**Frontend framework — React.**
Chosen by the human. Familiarity dominates for a solo project, and the
performance-sensitive part (the graph) is hand-drawn SVG over a pure layout
function in the domain, so it sits outside the framework either way.

**Bundled-jj licensing — `NOTICE` plus a licence file in the app bundle.**
See `NOTICE`. jj is Apache-2.0; Ukemi does not modify the binary, it invokes it.

**The default revset — jj's own `revsets.log`, verbatim.**
`present(@) | ancestors(immutable_heads().., 2) | present(trunk())`. A
hand-rolled `ancestors(bookmarks() | @, 12)` was tried first and was wrong: it
silently hid the tip of any stack without a bookmark, which is most of them
while you are working. Matching the CLI also means the window shows what
`jj log` shows.

**Package layout — three packages, not four.**
The draft listed a separate `packages/jj-port`. A package holding one interface
with one implementation is not worth its own boundary, so the port lives in
`packages/domain/src/port.ts`. The hexagonal dependency direction is unchanged:
adapter → domain, UI → domain, and the UI never imports adapter types except at
the single wiring file (`apps/desktop/src/jj.ts`).

**Theme contract sufficiency — checked, and it caught a bug.**
Shipping Ink & Paper alongside the default proved the class contract carries a
structurally different skin (serif, square, outlined, one accent). It also
exposed a real trap: a theme rule outranks the contract's own state rules, so
overriding `.tb-btn` without restating `[data-variant="primary"]` made the
primary button invisible. Now fixed in the theme and written down as an
obligation in `apps/desktop/src/themes/CHANGELOG.md`.

## Still open

- **`ui.diff-editor` protocol.** Whether jj's wait-for-editor-exit contract fits
  a Tauri window lifecycle is untested; the hunk editor is P1.
- **Windows.** P0 targets macOS and Linux. jj's snapshotting is slow there.
- **Licence and pricing for Ukemi itself.**
- **Worker/OffscreenCanvas in WKWebView**, which decides whether a
  theme-supplied graph renderer (theme contract layer 3) can be sandboxed.

## Deliberately not built yet

No fs watcher. Reads refetch on window focus, which covers "I ran jj in a
terminal, then came back". A watcher on `.jj/repo/op_heads/` is the upgrade if
focus proves too coarse.

No virtual scrolling in the graph. The default revset is bounded; add it when a
real repo is slow, not before.

No `rebase`/`squash`/`split` in the port. They are P1, and a port method is a
two-line addition when the UI for them exists.

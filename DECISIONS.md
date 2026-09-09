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

**`ui.diff-editor` protocol — resolved, and the worry does not apply.**
jj hands a diff editor two directories (`left`, `right`) and waits for the
process to exit; whatever `right` holds then becomes the selection. The draft
asked whether that wait fits a Tauri window's lifecycle. It does not have to:
the UI collects the hunk selection *before* jj runs, so the "editor" never
shows a window. It is a fixed `/bin/sh` script that copies a pre-computed plan
over `right` and exits. No IPC, no second window, no lifecycle to reconcile.
See `packages/jj-cli-adapter/src/hunk-plan.ts`.

**Hunk selection is per change-run, not per jj hunk.**
jj pads a hunk with context, so two unrelated edits eight lines apart arrive as
a single `@@` block — a UI offering jj's hunks could not separate them.
`parseGitDiff` regroups each hunk into maximal runs of adjacent +/- lines,
which is the finest unit the diff actually supports.

**Non-interactive jj covers more than expected.**
`jj split [FILESETS]`, `jj squash [FILESETS]` and `jj resolve --tool :ours`
need no editor at all, so file-level split/squash and "take a side" resolution
avoid the protocol entirely. Only true hunk-level editing needs it.

**absorb has no dry run — the result is the preview.**
`jj absorb` offers no `--dry-run` in 0.43, and predicting where each hunk
lands would mean reimplementing its blame walk. So the inspector runs it and
shows jj's own stderr account ("Absorbed changes into …") next to the button,
with ⌘Z one key away. Same stance as the rebase preview: state the true thing.
To make that message reach the UI, writes no longer pass `--quiet`; reads do.

**Stacks are recognised, not declared.**
A stack is the run of mutable revisions from the first immutable ancestor up
to where the chain forks (`stackOf`, in the domain). Pushing it is
`jj git push --change` per revision, which both mints the bookmark on first
push and moves it after a rebase, so one button covers create and update. PRs
are matched to revisions through bookmark = head branch, never by predicting
the bookmark name jj will mint.

**`gh` is borrowed, not bundled.**
It carries the user's GitHub login. The forge adapter passes `-R owner/repo`
on every call (slug parsed from `jj git remote list`), so a non-colocated repo
whose Git dir is under `.jj/` works too. No GitHub remote or no `gh` means no
forge, and the stack panel degrades to push-only — a normal state, not an error.

**Colocation is judged by the shape of `jj git root`.**
A `.git` outside `.jj/` is colocated; `.jj/repo/store/git` is not. Comparing
against the workspace path failed on macOS, where `/var` is a symlink to
`/private/var`.

**The command log is a buffer, not a store.**
Every `jj`/`gh` call goes through an observer into a bounded module-level list
read with `useSyncExternalStore`. Nothing is derived from it, so it does not
violate "one server cache, no global store" — it is a log the panel displays.

## Still open

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

No line-by-line hunk selection (the design's "⇧ + click to split finer").
Change-runs are the natural unit of a unified diff and cover the cases that
motivated the feature; splitting inside a run means synthesising a diff jj
never produced, which is a different and riskier job.

No conflict prediction in the rebase preview. Nothing short of performing the
rebase can know the outcome, and a fabricated "1 conflict resolves" would be
worse than silence. The HUD promises the true thing instead: one ⌘Z.

No per-workspace "last operation by which process" on the board. jj's op log
records `user@host` but not the workspace, so nothing honest can be shown per
column; the working-copy commit's committer time is the true signal and is
what the card shows.

No Git index warning in the transparency panel. In a colocated repo jj resets
the index to match `@` on every command, and the app runs commands constantly,
so a staged-only state cannot persist long enough to warn about.

No three-way merge editor. The conflict panel offers "take a side"; anything
finer is a hunk edit, and that editor already exists. A second merge UI would
be a second thing to keep correct for no new capability.

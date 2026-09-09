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

**jj-lib adapter — not needed; measured, not assumed.**
On jj's own repository (15,210 commits, colocated) the adapter's reads are
10–50 ms each for a window load and `log -r all()` is 265 ms including NDJSON
parsing. Process spawn is not the bottleneck the draft feared. What would hurt
is painting 15k rows, so `useLog` caps the revset with `latest(…, 1000)` and
the footer says so. Option C from the design (§3-1) stays parked until a
measurement says otherwise.

**The sidecar's `bundle.resources` lives in an overlay config.**
Tauri errors on a resource path that does not exist — a literal one raises
`ResourcePathNotFound`, and a glob that matches nothing raises
`GlobPathNotFound` — so listing `jj` in `tauri.conf.json` would break
`cargo build` for every checkout without a staged binary. The base config stays
dev-clean and `tauri.bundle-jj.conf.json` adds the two resources at release
time. `stage-jj.mjs` refuses a `jj` that is not the pinned version, because a
sidecar whose version nobody checks is just a slower PATH lookup.

**Stacked PRs — the whole path ran against GitHub once.**
Private repo `yoonhoGo/ukemi-fixture`: `push --change` on a two-change stack
minted `push-<change>` bookmarks, `gh pr create` opened #1 → main and
#2 → push-first, `pullRequestFor` matched both through bookmark = head
branch, and a describe + re-push moved both bookmarks with the same command.

**Onboarding starts before there is a jj repo — the empty state is the door.**
A Git user's first action is to open their Git repository, so "not inside a jj
repository" was the app's only real first contact with them, and it was a dead
end. That screen now offers `jj git init --colocate` instead, and spends its
space on the one question that decides whether they take it: what happens to
`.git`. Ran against three shapes of real Git repo — a normal one with an
uncommitted file, one with no commits at all, and a detached HEAD — all three
colocate with exit 0 and `jj root` answers afterwards. `rm -rf .jj` then leaves
the branch, the commit and the uncommitted file exactly as they were, which is
what makes the "reversible" row in that table an honest claim rather than a
reassuring one.

**`git_probe` asks twice, and that is not redundancy.**
`rev-parse --git-dir` is the existence test and `symbolic-ref --short HEAD` is
the branch name, as two invocations inside one blocking call. Combining them
was tried and is wrong: `symbolic-ref` fails on a repo with no commits and on a
detached HEAD, and neither of those means "not a Git repository" — a single
call would refuse exactly the repos most worth offering the door to. The commit
count and dirty-file count the design sketched were dropped rather than costing
two more invocations: "anything uncommitted becomes the working-copy change" is
the fact a wary user needs, and it needs no counting.

**Colocating needed no new Rust command.**
`jj_exec` is already argv-in, captured-output-out with no knowledge of jj's
verbs, so `["git", "init", "--colocate"]` goes through the existing seam and
through `observed`, which lands it in the command log like everything else —
the first command the app ever runs on a repo being the one most worth showing.
It is deliberately *not* a `JjPort` method: the port's `root` promises a jj
workspace, and this runs where there is not one yet.

**`jj backout` does not exist — the lookup table was checked against the binary.**
Written from memory the ⌘G table would have shipped at least one command that
is not there. Against jj 0.43: revert is `jj revert -r <rev> --onto <rev>`
(and `--onto` is required), `duplicate` spells its destination `--onto` with
`-d` as an alias, and `op log` is an alias for `operation log`. Every row's jj
side also uses the *adapter's* spelling (`--onto`, `--from`/`--into`,
`op restore`), so what the panel promises and what actually executes cannot
drift apart in wording.

**Milestones are derived from the command log, not wired to buttons.**
The same jj verb is reachable from several places — the inspector's next steps,
the hunk sheet, the stack panel, an ⌥ drag in the graph — so a milestone that
ticked from only one of them would be a lie about what the user has done. Five
of the seven are read off `CommandRecord` argv in one testable function; the
remaining two (meeting a conflict, opening the board) have no command behind
them and are reached by the window. Only exit code 0 counts: a command that
failed taught nothing. Rescanning the whole bounded log on each new command is
cheaper than tracking a cursor and cannot double-count, because reaching a
milestone is idempotent.

**Transition progress belongs to the user, not the repository.**
One `localStorage` key, not one per repo: the habits being unlearned are the
person's, and re-teaching "there is no index" on their second repository would
be insulting. It also means the three welcome cards appear exactly once, ever.

**Localisation — English source strings as the keys, no framework.**
The earlier entry deferred this as an app-wide decision rather than an
onboarding one; the decision is Korean alongside English, everywhere, including
the Rosetta table and the seven milestones. `t("Back to now")` keys on the
English string itself, so English is the empty catalogue, a missing translation
falls back to a sentence rather than a key, and the same line written in two
files is one entry. i18next was weighed and skipped: no namespaces, no plural
categories the two languages disagree on, nothing worth an async boundary.

The two structural consequences. Prose that lives in *data* — `ROSETTA`,
`MILESTONES`, `THEMES` — stays English in the table and is translated where it
is drawn (`t(entry.why)`), which keeps those tables plain constants and their
tests untouched. And a sentence with something styled inside it (a revset in
mono, a branch name) is one key split on its placeholder by `tParts`, never two
half-keys concatenated: Korean puts the halves in the other order.

`i18n.test.ts` is the guard. It scans every literal `t("…")` in the source, and
reads the three data tables directly, so a string that ships untranslated fails
the build rather than appearing in English next to Korean. It also fails on two
files translating one key differently — which caught twelve, all of them a
shortcut-table label and a Rosetta step being the same English sentence.

**One Korean register: `-습니다` throughout.**
Onboarding went polite first and the rest of the window followed, because a
window that addresses you on the welcome card and then states facts at you in
the graph reads like two products. The English copy has one voice; so does the
Korean. Instructions become `-세요` ("리브셋을 좁히세요"), not `-십시오`, which
is stiffer than anything the English says.

Noun-phrase labels ("스택 푸시", "마지막 오퍼레이션 되돌리기") carry no register
at all. That is not a gap — it is what lets one catalogue key serve the shortcut
sheet, a Rosetta step and a milestone label without sounding wrong in any of the
three, and it is why the register change touched 81 values and left the other
245 alone.

**"now" means two things and gets one word.**
The cost of keying on the source string, found immediately: `t("now")` is a
commit timestamp under a minute old in one place and the present edge of the
operation timeline in the other. Rather than add a context-prefix convention
for a single collision, both take 지금. Add the convention when a second
collision is one where the two really cannot share a word.

**SUIT is bundled for Hangul, and sits behind the system faces.**
The window had no bundled face at all: Korean fell through to Apple SD Gothic
Neo, which is drawn for print and reads noticeably looser than SF beside it.
SUIT goes into `--u-font` *after* `"SF Pro Text"` rather than in front of it,
because font matching runs per character down the list — a Latin letter is
found in SF and never reaches SUIT, a Hangul syllable is in none of the system
faces ahead of it and lands there. Verified in the running window, not
reasoned: the served asset is `624,536` bytes of `font/woff2`, the Korean rows
changed face, and `git add -p` in the onboarding cards is still SF Mono, so
nothing leaked into Latin. Ink & Paper and Acid Terminal opt out — the first is
a serif theme whose Korean must also be serif, the second is mono throughout
and a proportional Hangul face is the texture it exists to avoid.

The licence lives in `apps/desktop/public/`, not beside the woff2. OFL 1.1 §2
requires the licence to travel with the font, and Vite emits only the assets a
stylesheet references, so a text file next to the font would have stayed in the
repository and never reached a build. `public/` is copied verbatim into `dist`,
which is what Tauri embeds, so it ships from a plain `tauri build` and not only
from `build:bundled` — checked: `dist/SUIT-OFL.txt` is 4.3 KB next to
`dist/assets/SUIT-Variable-*.woff2`. While confirming that, `NOTICE` was found
to have claimed an "About → Open-source licences" screen since v1 for the jj
licence. No such screen was ever built, so the claim is withdrawn rather than
duplicated for the font.

**The default theme follows the system appearance.**
`contract.css` had a full `@media (prefers-color-scheme: dark)` block gated on
`:root[data-theme-follows-system]` — an attribute nothing in the app ever set,
so a Mac in Dark Mode got the light palette and a white window. The block
applies to bare `:root` now. That is safe for the four explicit themes because
each sets its tokens on `:root[data-theme="…"]` (0,2,0) against `:root` (0,1,0)
and a media query adds no specificity, so a chosen theme still wins in both
appearances; only "System", which sets no attribute, is affected.

Making it work exposed the real trap. Three contract *classes* painted
`rgba(0, 0, 0, …)` directly rather than reading a token — the key cap's fill and
hairline, and the `.u-scroll` thumb — and a black alpha on a `#1e1e1e` ground is
not a faint chip, it is nothing at all. They are `--u-bg-key`, `--u-line-key`
and `--u-scrollbar-thumb` now, which also collapsed a drift: `scrollbar-color`
said 0.2 and the WebKit thumb said 0.18. The white alphas inside
`.tb-btn[data-variant="primary"] .key` stayed literal on purpose — they are
painted over `--u-accent`, which is a saturated fill in either appearance.

**The accent is the one the user picked, not a hex we chose.**
`--u-accent` was `#0a84ff`, which is the iOS *dark* blue and was wrong for a
white window in the first place. The literals are now the light/dark system
blues as a fallback, and an `@supports (color: AccentColor)` block replaces them
with the accent from System Settings. It is two blocks, not one: `--u-accent-soft`
is a wash, and 12% over white is a visible tint while 12% over `#1e1e1e` is
nothing, so the dark appearance needs 20%. Lifting the percentage into a token
of its own would have added a public contract surface to avoid two short blocks.

**Motion: two durations, because selection and hover want different ones.**
`--u-duration` and `--u-ease` had been declared since v1 and used in exactly
zero places, which also made the `prefers-reduced-motion` block that zeroes them
decorative. Six interactive classes transition now, on `background`/`color`/
`box-shadow` and never on `all`. Selection got a second token,
`--u-duration-fast: 90ms`: hold ↓ in the graph and rows arrive faster than
180ms, so a selection animated at that length is still catching up with the
caret and the list smears. Both tokens are zeroed under reduced motion.

**The menu bar is built in TypeScript, and its items dispatch key events.**
Tauri's default menu was untouched: `File` held only `Close Window`, `View` only
full-screen, and not one of the app's ~25 commands appeared anywhere, which
Apple's HIG is explicit about. Built through `@tauri-apps/api/menu` rather than
`tauri::menu` in Rust, for two reasons: the labels then come from the same `t()`
catalogue as the window — verified in the running app, whose menu bar now reads
파일 / 편집 / 체인지 / 보기 / 오퍼레이션 / 창 / 도움말 — and `src-tauri/src/main.rs`
stays the dumb three-command seam it was. `core:default` already grants
`core:menu:default`, so no capability changed.

No item re-implements a command. Each handler dispatches the equivalent
synthetic `KeyboardEvent` on `window`, so the menu and the keyboard cannot
drift and a command is defined once. That works because macOS hands a key-down
to the main menu's `performKeyEquivalent:` before the key window, so an
accelerator is consumed by the menu and the web view never sees a `keydown` —
the chord runs once, from the handler.

Checked rather than assumed, because a dispatch that fired twice would have
been the obvious way for this to be wrong: `Help ▸ Shortcuts` opens the sheet,
and the command behind it is a *toggle*, so a double fire would have opened and
immediately closed it and looked like a dead menu item. The sheet stays open.
The cost of the design is that an item cannot grey
itself out without reading app state, which is exactly the coupling the
synthetic dispatch buys off; the keyboard has always behaved this way, so
nothing regressed.

Which keys may carry an accelerator is not a free choice. Only commands whose
handler sits on the *window* qualify: a key a focused field handles locally
would be swallowed by the menu while the user types, and a synthetic event
dispatched on `window` never reaches that field's own React handler. So ⌘↩,
Escape, the arrows and the hunk sheet's space are absent from the menu.
**⌘Z is the special case**: "undo the last operation" is in the Operations menu
with *no accelerator*, and the predefined `Edit ▸ Undo` is left alone, because
the description editor stops propagation and relies on ⌘Z being the native text
undo. An app-level accelerator would take that away, and the reasoning is in the
comment on `editMenu` so a later reader does not "fix" it back.

**One hook for the four overlays, and Escape stays where it was.**
`ui/modal.ts` does three things — initial focus, Tab containment, focus
restoration — for the shortcut sheet, the progress panel, the hunk sheet, the
Git lookup and now Settings. A hook rather than five copies because of the hunk
sheet: its own window handler is in *capture* and stops propagation for every
key it does not use, so a listener on the panel would never see Tab. The hook
therefore listens on the window in capture too, which does not depend on which
of the two registered first. Escape is deliberately not in it — the window's
key map owns Escape and closes the sheets in a priority order, and a second path
would race that one. Focusable stops are queried on each keypress rather than
cached, because every one of these panels changes while it is open.

**An operation label names the kind and shortens the hash.**
The timeline read `8666c7c4ab9ca51da0944…`: jj writes an operation description
for a terminal line, where `commit <40-hex>` is fine, and a 22-character tick
turned the hash into the whole label. The hash is not resolved to the commit's
own subject, because `Operation` carries id, description, time, user and args
and nothing else, and the commit it names is usually outside the loaded revset
— a subject would cost one `jj` read per tick, sixty of them per window. The
kind is translated and the hash cut to the eight characters jj itself prints.
The shapes matched are the ones this repo's own `jj op log` actually produces,
checked against the binary rather than written from memory, and the function
lives in `ui/operation-label.ts` rather than inside `Timeline.tsx` so it is
testable without a window. That move matters twice: the labels are read as
`t(key, …)` from a table, which `i18n.test.ts`'s literal scan cannot see, so the
table is imported into the catalogue guard the way `ROSETTA` and `MILESTONES`
already are.

**The diff is read in a wide sheet, and the inspector no longer shows one.**
The inline diff opened inside a 372px panel, so a unified diff wrapped on
nearly every line and reading one meant reassembling it. The fix is width, and
width is the seventh sheet (1100×720) rather than a second OS window: a
`WebviewWindow` costs a second React root, a second query client or a cache
sync between them, its own menu and its own window-state persistence — for a
pane that shows a string this window has already read.

Two things were deleted rather than kept alongside it. The inline diff is gone
entirely: a file row that expanded in place *and* a sheet would be two ways to
read the same diff, and a row that did one sometimes and the other the rest of
the time is worse than either. And the sheet reads
`jj diff -r <rev> --git` **once** for the whole revision instead of once per
file, so walking the change with ↑/↓ costs no jj calls — that is the same read
the hunk sheet already makes, and it is what let the line numbers be fixed:
the inline gutter had been printing `index + 1` of the rendered array, which is
the file's line number only for a single-hunk diff starting at line 1. The
sheet renders the domain's `parseGitDiff`, which counts from the `@@` headers
and carries both sides per line, so the wide view — where a wrong number is
legible — shows the true ones. `FileChange.insertions`/`deletions` are declared
but never populated (`jj diff --summary` prints no counts), so the header's
`+n −m` is counted off those same parsed lines.

Not side-by-side, and not pretending to be. jj emits a unified diff; the two
gutters are the old and new line numbers, not two versions of the file. What
the width buys is a real measure and no wrapping — the rows opt back into
`white-space: pre` and the block sizes to `max-content`, so long lines scroll
sideways inside the pane instead of folding.

**The toolbar moves the window itself, not through `data-tauri-drag-region`.**
This window has no title bar (`titleBarStyle: "Overlay"` plus `hiddenTitle`), so
the toolbar is one, and the attribute Tauri ships for that is what we used
first. It could not be made reliable, and the reason is in the script Tauri
injects — read out of the built binary rather than guessed at:

    e.button === 0 && (e.detail === 1 || e.detail === 2) && isDragRegion(…)

`e.detail` is the click count. A *failed* drag leaves the pointer exactly where
it started, so the next attempt in the same spot is click 2 and the one after
that is click 3 — from there the script refuses until the double-click interval
expires. One miss ratchets into a run of misses, which is what "it works
sometimes, but more often it doesn't" actually was. The geometry was a red
herring: the user marked the spots they grab and they were the right spots.

Two things were learned on the way and are worth keeping written down. A bare
`data-tauri-drag-region` means "only a direct click on *this* element", not
"this subtree" (`return el === composedPath[0]`), so the attribute on a flex
container whose children cover it drags from nowhere at all; `deep` is the
value that means the subtree. And `core:window`'s default permission set does
**not** include `allow-start-dragging` — it grants `allow-internal-toggle-maximize`,
which is the command the injected script uses — so calling the API needs two
lines in `capabilities/default.json` and a rebuild, and a capability that is
merely written down is silently denied at runtime.

So `ui/window-drag.ts` asks for the drag on mousedown: the same two gestures a
system title bar has, drag to move and double-click to zoom, with no click-count
gate. Controls are excluded by a `closest()` selector rather than Tauri's fuller
`isClickableElement` walk, and the revset field keeps
`data-tauri-drag-region="false"` as the opt-out even though nothing reads the
attribute for us any more — it is still the vocabulary a reader will look for.

**Settings keeps its key and gets one row back.**
Moving the theme and language pickers behind ⌘, was right and the sidebar was
right to lose eleven rows of preferences from the middle of its navigation. It
was wrong to leave nothing in their place: the pickers became unfindable, and
`themes/contract.css` exists on the argument that a theme nobody can select is a
theme nobody has checked. One `side-item` row — label, gear, `⌘,` — is the
smallest thing that teaches the shortcut instead of replacing it, and it reads
the way the transition strip below it already does.

**Saved revsets are jj's `revset-aliases`, not app state.**
The obvious place for a user's named queries was a `ukemi:revsets` key beside
the recent-repos list in `localStorage`. It was the wrong place: a saved query
the GUI alone understands is a second, weaker idea of something jj already has.
`jj config set --repo revset-aliases.<name> '<expr>'` stores it, `unset` removes
it, and the name then works in the ⌘L field *and* in `jj log -r <name>` at a
terminal — which is also why a sidebar row sets the revset to the name rather
than to the expansion.

Three consequences, all deliberate. Repo scope only (`--repo`), because jj's
built-in aliases live in the defaults and a list including `trunk()` and
`immutable_heads()` would bury the seven rows the user actually made; a
user-global alias is invisible in the window, which is the ceiling. A config
edit creates no operation, so ⌘Z does not reach it and the mutations skip
`useJjMutation` — naming a revset while parked in the past must not throw the
window back to the present. And the name is a trust boundary in the direction
`quote()` does not cover: it enters a config key and comes back out as a bare
symbol inside an expression, jj accepts `revset-aliases."a | all()"` without
complaint, so `isAliasName` narrows it to a plain symbol and the adapter
re-checks before the argv. A hand-written function alias (`mine-but(x)`) is
skipped by the reader rather than shown as a row nothing can safely click.

## Still open

- **A screen that shows the licences.** Both the jj and SUIT licence texts ship
  inside the bundle; neither is reachable from inside the window. `NOTICE`
  claimed such a screen from v1 and the claim is now withdrawn. Shipping the
  text is what the licences require; showing it is a courtesy still owed.
- **The menu bar before a repository is open.** `installAppMenu()` runs from the
  exported `App`'s mount effect, so the repository picker and the welcome cards
  still get Tauri's default menu — including on the one screen where `File ▸
  Open` would help most. Installing it from `main.tsx` instead would fix that at
  the cost of a menu whose change and operation items are inert until a repo is
  open, and greying those out is the state coupling the synthetic dispatch
  exists to avoid.
- **⌘A in the hunk sheet is eaten by `Edit ▸ Select All`.** The accelerator
  consumes the chord before the sheet's listener sees it, so "check or uncheck
  everything" has never fired — this is not new, Tauri's default menu carried
  Select All too, but the shortcut sheet documents a key that cannot work.
  Dropping Select All is not the answer (the revset field and the description
  editor need it); the options are a different binding inside the sheet, or
  toggling that item's `enabled` while the sheet is up.
- **Windows.** P0 targets macOS and Linux. jj's snapshotting is slow there.
- **Licence and pricing for Ukemi itself.**
- **Whether the graph should read the metric tokens** instead of the JS
  constants in `ui/graph-geometry.ts`. It would need `getComputedStyle` on the
  root plus a theme store to re-render on a switch, and no theme has yet wanted
  a different row pitch badly enough to pay for it — Candy Bento got its fat
  lanes out of the gap its row cards leave. Until then the tokens are half
  true and the changelog says so.
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

No block editor for composing revsets. The ⌘L field is the composition UI, and
a palette of AND/OR/NOT blocks on top of it would be a second query language
that can never reach `roots(x..y)::` or `latest(x, n)` — so the moment a
question got interesting the user would be back in the field, having learnt
nothing transferable. Completion inside the field is the upgrade path if
composing proves hard; a builder that hides the expression is not.

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

No Jelly skin. The design canvas's fifth style is a motion spec — squash is
two blobs pressing into one, split is one blob pinching in two, rebase stretches
and snaps — and a theme in contract v1 can only paint tokens and classes. The
graph renderer is layer 3 and is not in the contract, so Jelly as CSS would be
the gummy shell without the physics, which is the part that made it worth
picking. It waits on layer 3, which waits on the Worker/OffscreenCanvas
question above.

No three-way merge editor. The conflict panel offers "take a side"; anything
finer is a hunk edit, and that editor already exists. A second merge UI would
be a second thing to keep correct for no new capability.

No Run button in the ⌘G panel. For most rows the answer *is* a keystroke in
this window, and the rest are one-liners to copy; a Run that worked for some
rows and not others would be worse than none. Copy plus the keys is the whole
affordance.

No measured positioning for coach hints. Four fixed spots (toolbar, inspector,
sidebar, timeline), because every one of the seven is about one of those
regions. Measuring real anchor elements is the upgrade if a hint ever needs to
point at something that moves.


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

No Run button in the ⌘G panel. For most rows the answer *is* a keystroke in
this window, and the rest are one-liners to copy; a Run that worked for some
rows and not others would be worse than none. Copy plus the keys is the whole
affordance.

No measured positioning for coach hints. Four fixed spots (toolbar, inspector,
sidebar, timeline), because every one of the seven is about one of those
regions. Measuring real anchor elements is the upgrade if a hint ever needs to
point at something that moves.


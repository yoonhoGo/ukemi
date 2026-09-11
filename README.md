<img src="apps/desktop/src-tauri/icons/icon.png" width="96" align="right" alt="">

# Ukemi

A desktop GUI for [Jujutsu (jj)](https://github.com/jj-vcs/jj).

Not a Git GUI with a jj skin. The four things only jj has are the first-class
citizens: the operation log (time-travel undo), the working copy *being* a
commit (no staging), conflicts as data (work never stops), and workspaces
(parallel agents).

Design: `notes/` · draft at `jj-desktop-gui-설계.md`

## Layout

    packages/domain           types, the JjPort interface, pure functions (graph layout, revsets)
    packages/jj-cli-adapter   the only side-effecting code: runs `jj`, parses NDJSON templates
    apps/desktop              Tauri 2 shell + React UI

Dependency direction is one-way: `jj-cli-adapter → domain` and `desktop → domain`.
The UI never sees the adapter's types.

## Why the CLI and not jj-lib

`jj-lib` makes breaking changes monthly and its own docs say the API is
unsettled. jj's CLI, by contrast, is built for scripting — `--template`,
`--at-op`, `--ignore-working-copy`, and a `json()` template function. So the
adapter shells out to a **bundled** `jj` binary, pinning the version away from
whatever is on the user's PATH.

`packages/jj-cli-adapter/src/contract.test.ts` runs the real binary and fails
loudly if a template's shape moves. That test is the version guard.

## Develop

    npm install
    npm test         # graph layout + adapter contract (needs `jj` on PATH)
    npm run typecheck
    npm run dev      # Tauri dev window

Node 24 runs the TypeScript directly, so packages have no build step.

## Languages

English and Korean. The window follows the system language on first launch and
remembers whatever you pick in the sidebar. Strings are keyed on their English
source (`apps/desktop/src/i18n/`), so a missing translation shows the English
sentence rather than a key — and `npm test` fails on a string that never got
one.

## Optional: GitHub

Stacked PRs use the `gh` CLI from your PATH, with your own login. Without it,
or without a GitHub remote, everything else works and the stack panel only
pushes.

## What jj does that Ukemi does not

The adapter covers the verbs the window has a place for. jj 0.43 has more, and
none of the following is a decision *against* the feature — the ones this repo
has actually ruled out live in `DECISIONS.md` under "Deliberately not built
yet". This is the backlog, with the reason each one is still on it.

**Rewriting.** `jj revert` and `jj duplicate --onto` are the awkward pair: the
⌘G table already teaches both, in jj's exact spelling (`ui/rosetta.ts`), so the
window tells you a command it cannot run. They belong on the graph's row menu.
`jj metaedit` (author and timestamp), `jj parallelize` and `jj simplify-parents`
are one port method and one step each. `jj fix` runs a formatter across a
revset, which wants a preview more than it wants a button.

**`jj arrange`.** "Interactively arrange the commit graph" — the one jj command
whose natural surface is a GUI, and `ui/drag-rebase.tsx` is half of it already.
The cost is that jj ships it as a TUI with no non-interactive form, so this is
not a shell-out: it means rebuilding the operation out of `rebase` primitives
and being right about the result.

**`jj bisect run`.** Native since 0.43 and revset-shaped, which is exactly what
this window draws. Fork and Sublime Merge sell a bisect UI; here the canvas for
marking good and bad already exists.

**Signing.** `jj sign` / `jj unsign`, plus a badge on a signed row. The template
can report it; nothing reads that field yet.

**Navigation and plumbing.** `jj next` / `jj prev` are a keyboard walk up and
down a stack. `jj sparse` has no UI. `jj op abandon` is how an operation log
gets pruned, and the timeline is the only place that would show it.

From the commercial Git clients, three things worth taking:

- **A search that writes a revset.** Author, date and path are three fields that
  compose into `author(…) & files(…)`; ⌘K already establishes the pattern of a
  sheet that drafts into the ⌘L field rather than replacing it.
- **More than one repository.** One window, one repo, no memory of the others
  beyond the picker's recents.
- **Image and binary preview.** The diff sheet says "Binary file — no text diff
  to show" and stops.

Syntax highlighting is the one every client has and this one should probably
not take: a highlighter is either a dependency, against the five-runtime-deps
rule, or a per-language debt that grows forever. Word-level diff was the part of
that value available for a pure function and no dependency, and it is in.

## Versioning

One number, one place: `version` in `apps/desktop/src-tauri/tauri.conf.json`.
Tauri prefers it over `Cargo.toml`, and it is what the app's About box, the
bundle file name and the updater manifest show. Every `package.json` and the
Cargo crate stay at `0.0.0` — they are private workspace members, never
published, so a version there would be a second truth nobody reads.

SemVer, pre-1.0: `0.MINOR.PATCH`. A new capability or a jj sidecar bump is a
minor; a fix is a patch. Cutting a release is three steps:

    # 1. bump "version" in apps/desktop/src-tauri/tauri.conf.json
    jj commit -m "release: v0.2.0"
    jj bookmark set main -r @- && jj git push
    git tag v0.2.0 && git push origin v0.2.0

The tag is `v` + the config version, on the release commit. `0.0.0` means
"never released"; the first tag will be `v0.1.0`.

Pushing the tag runs `.github/workflows/release.yml`: it refuses a tag that
does not match the config version, fetches the pinned `jj`, runs the tests,
builds the bundled DMG for Apple silicon and attaches it to a GitHub Release.
The bundle is ad-hoc signed (`signingIdentity: "-"`) so Gatekeeper sees a
valid signature, but it is not notarised, and macOS 15+ no longer offers
right-click → Open as a way past that. Either works:

    xattr -dr com.apple.quarantine /Applications/Ukemi.app

or open the app once, dismiss the warning, then System Settings → Privacy &
Security → *Open Anyway*. Notarisation needs an Apple Developer ID; the day
there is one, `APPLE_CERTIFICATE`/`APPLE_ID` secrets in the release workflow
replace both of these steps.

## Licence

The bundled `jj` is Apache-2.0; see `NOTICE`.

## Bundling the jj sidecar

The Rust shell resolves `jj` from the app's resource directory and falls back
to `jj` on PATH, so a dev checkout needs no setup. For a release:

    npm run build:bundled --workspace @ukemi/desktop

That stages the binary (`src-tauri/stage-jj.mjs`) and builds with
`src-tauri/tauri.bundle-jj.conf.json`, an overlay that adds `bundle.resources`.
The overlay is separate because Tauri errors on a resource path that does not
exist, so listing `jj` in the base config would break `cargo build` for anyone
who has not staged one.

Staging refuses a `jj` whose version is not the `PINNED` constant in
`stage-jj.mjs` — that pin is the point of shipping a sidecar. Bump it and run
the adapter's contract test in the same change, never separately. The
Apache-2.0 licence text is fetched to `src-tauri/LICENSE-jj` if missing.

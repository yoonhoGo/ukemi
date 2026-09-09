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

## Optional: GitHub

Stacked PRs use the `gh` CLI from your PATH, with your own login. Without it,
or without a GitHub remote, everything else works and the stack panel only
pushes.

## Licence

The bundled `jj` is Apache-2.0; see `NOTICE`.

## Bundling the jj sidecar

The Rust shell resolves `jj` from the app's resource directory and falls back
to `jj` on PATH, so a dev checkout needs no setup. For a release:

1. Copy the `jj` binary for the target into `apps/desktop/src-tauri/`.
2. Copy jj's Apache-2.0 licence text alongside it as `LICENSE-jj`.
3. Add both to `bundle.resources` in `tauri.conf.json`.
4. Run `npm run build --workspace @ukemi/desktop`.

Step 3 is deliberately not committed: `tauri build` fails on a missing
resource, which would break the build for anyone who has not fetched a binary.

## Themes

`apps/desktop/src/themes/contract.css` is a public API — tokens plus a set of
semantic classes. A theme overrides those and nothing else. Built-in themes
load through the same path an external one would, which is how the contract
gets checked for sufficiency rather than just documented.

Contract version and its change history: `apps/desktop/src/themes/CHANGELOG.md`.

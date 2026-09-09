# Project: Ukemi

A desktop GUI for Jujutsu (jj). See `README.md` for the why; this file is the
working agreement.

## Tech Stack

- Runtime: Node.js 24 (runs TypeScript directly — no build step for packages)
- Language: TypeScript 5.7, `strict` + `noUncheckedIndexedAccess` +
  `exactOptionalPropertyTypes` + `erasableSyntaxOnly`
- UI: React 19 + TanStack Query 5, Vite 6
- Shell: Tauri 2 (Rust, edition 2021)
- Tests: `node:test` + `node:assert/strict` (no Jest, no Vitest)
- Workspaces: npm workspaces (`packages/*`, `apps/*`)

## Project Structure

- `packages/domain`: types, the `JjPort`/`ForgePort` interfaces, pure functions
  (graph layout, revsets, diff, stack). No I/O.
- `packages/jj-cli-adapter`: the only side-effecting code — runs `jj`/`gh`,
  parses NDJSON templates.
- `apps/desktop/src`: React UI. `ui/` is presentation; `jj.ts`, `repo.tsx`,
  `App.tsx` are the composition root.
- `apps/desktop/src-tauri`: Rust shell, sidecar staging (`stage-jj.mjs`).
- `apps/desktop/src/i18n`: string catalogues keyed on the English source.

Dependency direction is one-way: `jj-cli-adapter → domain`, `desktop → domain`.

## Commands

- `npm test`: all tests (adapter contract test needs `jj` on PATH)
- `npm run typecheck`: `tsc --noEmit` across the workspace
- `npm run dev`: Tauri dev window
- `node --test packages/domain/src/graph.test.ts`: one file

## Code Style

- ESM only. Relative imports carry the extension: `./graph.ts`, `./Board.tsx`.
- `import type { … }` for types (`verbatimModuleSyntax` is on).
- No enums, namespaces, or constructor parameter properties
  (`erasableSyntaxOnly`).
- Domain stays pure; anything that shells out belongs in the adapter.
- Reads go through `jj --ignore-working-copy --at-op=<id>`; see `ReadOptions`
  in `packages/domain/src/port.ts`.
- User-visible strings go through `t("English sentence")`, with `{name}`
  placeholders — never string concatenation. Add the Korean line to
  `apps/desktop/src/i18n/ko/`.
- Comments explain *why*, in prose, above the thing. Match the density already
  in the file. A deliberate shortcut gets a `ponytail:` comment naming its
  ceiling.

## ⛔ Do Not

- Do not import `@ukemi/jj-cli-adapter` from `apps/desktop/src/ui/**` — the UI
  talks to `JjPort`.
- Do not add a dependency for what the platform already does; this repo has
  five runtime deps outside the workspace on purpose.
- Do not switch to `jj-lib`, i18next, or a test framework — each is a recorded
  decision in `DECISIONS.md`.
- Do not add a string to the source without its Korean catalogue entry;
  `npm test` fails on it.
- Do not edit `apps/desktop/src-tauri/gen/**` (generated) or commit
  `src-tauri/jj` (gitignored sidecar).
- Do not bump the `PINNED` jj version in `stage-jj.mjs` without running the
  adapter contract test in the same change.

## Workflow

1. `npm run typecheck` and `npm test` before calling anything done.
2. A decision that closes off an alternative goes in `DECISIONS.md` — that file
   is why the codebase has no second merge editor, no fs watcher, no virtual
   scrolling.
3. The repo is jj-colocated (`.jj/` and `.git/`); jj commands are safe here.

## 📚 References

- `README.md`: architecture rationale, sidecar bundling
- `DECISIONS.md`: resolved decisions, open questions, deliberate omissions
- `apps/desktop/src/themes/contract.css`: the theme class contract

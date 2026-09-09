#!/usr/bin/env node
// Stage the jj sidecar beside tauri.conf.json, for `npm run build:bundled`.
//
// Bundling exists to pin the version that the templates in
// packages/jj-cli-adapter/src/templates.ts were written against, so a version
// that does not match PINNED is an error rather than a warning. Bump PINNED
// and re-run the contract test together, never separately.
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PINNED = '0.43.0'

const here = dirname(fileURLToPath(import.meta.url))
const source = process.argv[2] ?? execFileSync('which', ['jj']).toString().trim()

const version = execFileSync(source, ['--version']).toString().trim()
if (version !== `jj ${PINNED}`) {
  throw new Error(`${source} is "${version}", but this build pins jj ${PINNED}`)
}

copyFileSync(source, join(here, 'jj'))
chmodSync(join(here, 'jj'), 0o755)

// Apache-2.0 §4(a): the licence travels with the binary. Fetch it once rather
// than making the release step a thing a human can forget.
const licence = join(here, 'LICENSE-jj')
if (!existsSync(licence)) {
  const url = `https://raw.githubusercontent.com/jj-vcs/jj/v${PINNED}/LICENSE`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`could not fetch ${url}: ${response.status}`)
  writeFileSync(licence, await response.text())
}

console.log(`staged ${version} from ${source}`)

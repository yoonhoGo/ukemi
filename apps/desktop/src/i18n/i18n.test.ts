import { test } from "node:test";
import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { ko } from "./ko/index.ts";
import { t } from "./i18n.ts";
import { MILESTONES } from "../ui/onboarding.ts";
import { KIND_LABELS } from "../ui/revset-palette.ts";
import { ROSETTA } from "../ui/rosetta.ts";
import { LABELS as OPERATION_LABELS } from "../ui/operation-label.ts";

const SRC = join(import.meta.dirname, "..");

/**
 * Every `t("…")` written literally in the source.
 *
 * Calls that pass a *field* — `t(entry.why)` — cannot be seen from here, which
 * is exactly why the data tables below are checked against the catalogue
 * directly rather than through this scan.
 */
function literalKeys(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const files = globSync(join(SRC, "**/*.{ts,tsx}")).filter(
    (file) => !file.includes("/i18n/") && !file.endsWith(".test.ts"),
  );
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/\bt\(\s*(["'])((?:\\.|(?!\1)[^\n])*?)\1/g)) {
      const key = match[2]!.replace(/\\(.)/g, (_, char: string) =>
        char === "n" ? "\n" : char,
      );
      found.set(key, [...(found.get(key) ?? []), basename(file)]);
    }
  }
  return found;
}

const placeholders = (line: string) =>
  [...line.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort();

test("every string the source asks for is in the Korean catalogue", () => {
  const missing = [...literalKeys()]
    .filter(([key]) => !(key in ko))
    .map(([key, files]) => `${files[0]}: ${key}`);
  assert.deepEqual(missing, []);
});

test("the prose in the data tables is translated too", () => {
  // These are read as `t(entry.why)` at render, so nothing else would notice
  // a new Rosetta row, milestone or operation label shipping in English only.
  const fromData = [
    ...ROSETTA.flatMap((entry) => [entry.why, ...entry.steps.map((step) => step.label)]),
    ...MILESTONES.flatMap((milestone) => [milestone.label, milestone.title, milestone.body]),
    ...OPERATION_LABELS.map(([, key]) => key),
    ...Object.values(KIND_LABELS),
  ];
  assert.deepEqual(
    fromData.filter((line) => !(line in ko)),
    [],
  );
});

test("the check-state labels are translated", () => {
  // `CHECK_MARK` in Stack.tsx is read as `t(mark.label)`, so the literal scan
  // above cannot see it — and the file is `.tsx`, which `node --test` will not
  // import. Read as text, the way the theme registry below is, and for the
  // same reason.
  const source = readFileSync(join(SRC, "ui/Stack.tsx"), "utf8");
  const labels = [...source.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]!);
  assert.ok(labels.length > 0, "the regex should still find the check labels");
  assert.deepEqual(
    labels.filter((line) => !(line in ko)),
    [],
  );
});

test("theme names and notes are translated", () => {
  // themes.ts imports a stylesheet, so it is read as text rather than imported.
  const source = readFileSync(join(SRC, "themes/themes.ts"), "utf8");
  const prose = [...source.matchAll(/(?:name|note): "([^"]+)"/g)].map((match) => match[1]!);
  assert.ok(prose.length > 0, "the regex should still find the theme registry");
  assert.deepEqual(
    prose.filter((line) => !(line in ko)),
    [],
  );
});

test("a translation keeps the placeholders its key declares", () => {
  const wrong = Object.entries(ko)
    .filter(([key, line]) => placeholders(key).join() !== placeholders(line).join())
    .map(([key]) => key);
  assert.deepEqual(wrong, []);
});

test("no two catalogue files translate the same key differently", async () => {
  const seen = new Map<string, string>();
  const clashes: string[] = [];
  for (const file of globSync(join(SRC, "i18n/ko/*.ts"))) {
    if (basename(file) === "index.ts") continue;
    const module: Record<string, unknown> = await import(file);
    const entries = Object.values(module)[0] as Record<string, string>;
    for (const [key, line] of Object.entries(entries)) {
      const previous = seen.get(key);
      if (previous !== undefined && previous !== line) clashes.push(key);
      else seen.set(key, line);
    }
  }
  assert.deepEqual(clashes, []);
});

test("an untranslated key falls back to itself", () => {
  assert.equal(t("nothing has ever translated this"), "nothing has ever translated this");
});

test("placeholders are filled, and an unknown one is left visible", () => {
  assert.equal(t("{count} revisions", { count: 3 }), "3 revisions");
  assert.equal(t("{count} revisions"), "{count} revisions");
  assert.equal(t("{a} and {b}", { a: "x" }), "x and {b}");
});

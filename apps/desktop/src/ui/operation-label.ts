/**
 * Turning a jj operation description into a timeline tick's label.
 *
 * jj writes an operation description for a terminal line, where a full commit
 * hash is a feature: `commit <40-hex>`, `describe commit <40-hex>`, `squash
 * commits into <40-hex>`. In a tick that fits 22 characters the hash *is* the
 * whole label, which is how the timeline came to read `8666c7c4ab9ca51da09…`.
 *
 * The hash is not resolved to the commit's own description on purpose:
 * `Operation` carries id, description, time, user and args and nothing else
 * (`packages/domain/src/types.ts`), and the commit it names is usually outside
 * the loaded revset, so a subject line would cost one `jj` read per tick. The
 * kind is translated instead and the hash cut to the prefix jj itself prints.
 *
 * This lives beside `Timeline.tsx` rather than inside it for the same reason
 * `time.ts` and `command-line.ts` do: it is a pure function over a string, so
 * it is the part that can be checked without a window — and `LABELS` is read
 * through `t(key, …)`, which the literal scan in `i18n.test.ts` cannot see, so
 * the catalogue guard has to import the table directly.
 */
import { t } from "../i18n/i18n.ts";

/**
 * The operation shapes this repo's own `jj op log` actually produces, matched
 * whole rather than parsed.
 *
 * ponytail: a verb nobody has run here yet falls through to the description
 * with its hashes shortened, which is already legible — the ceiling is that it
 * reads in English until someone adds its row. Adding one is a line here plus
 * its Korean line in `i18n/ko/chrome.ts`.
 */
export const LABELS: readonly (readonly [RegExp, string])[] = [
  [/^snapshot working copy$/, "Snapshot"],
  [/^new empty commit$/, "New change"],
  [/^commit (\S+)$/, "Commit {id}"],
  [/^describe commit (\S+)$/, "Describe {id}"],
  [/^split commit (\S+)$/, "Split {id}"],
  [/^squash commits into (\S+)$/, "Squash into {id}"],
  [/^point bookmark (\S+) to commit (\S+)$/, "Point {name} to {id}"],
  [/^push bookmark (\S+) to git remote (\S+)$/, "Push {name}"],
];

/** Eight characters is what jj prints when it prints a short hash itself. */
const SHORT_HASH = /[0-9a-f]{12,}/g;

export function operationLabel(description: string): string {
  const short = (description.split("\n")[0] ?? "").replace(SHORT_HASH, (hash) =>
    hash.slice(0, 8),
  );
  for (const [pattern, key] of LABELS) {
    const match = pattern.exec(short);
    if (!match) continue;
    // A two-capture shape is `<name> … <id>`; a one-capture shape is the id.
    return t(key, { name: match[1] ?? "", id: match[2] ?? match[1] ?? "" });
  }
  return short;
}

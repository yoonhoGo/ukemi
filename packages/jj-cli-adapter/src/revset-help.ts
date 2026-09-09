import type { RevsetFunction } from "@ukemi/domain";

/**
 * The other wire format jj owns: `jj help -k revsets`, as Markdown prose.
 *
 * Parsed rather than transcribed because a hand-written list of 58 function
 * names is a list that goes quietly stale — jj ships monthly, and the binary
 * this reads is the one `stage-jj.mjs` bundled. `contract.test.ts` runs the
 * real `jj help` through here, so a format change surfaces as a failing test
 * instead of a palette that silently lists last year's functions.
 *
 * Kept out of `domain` for the same reason `templates.ts` is: it is pure, but
 * what it is pure *about* is jj's output.
 */

/**
 * An entry opens with `* \`name(params)\`: first line` and continues on
 * two-space-indented lines until a blank one. Requiring the parentheses is
 * what keeps the operator and string-pattern sections out — `\`x-\`` and
 * `\`exact:"string"\`` are bulleted the same way and are not functions.
 */
const OPENS = /^\* `([a-z_][a-z0-9_]*)\(([^)]*)\)`:\s*(.*)$/;
const CONTINUES = /^ {2}(\S.*)$/;

/**
 * The first sentence, with Markdown taken off.
 *
 * A period only ends the sentence when a capital or a backtick follows, so
 * `heads(all())` and `x ~ ::x-` inside a sentence do not cut it in half.
 */
function firstSentence(prose: string): string {
  const plain = prose
    // `[string pattern](#string-patterns)` → `string pattern`.
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`/g, "")
    .trim();
  const end = plain.search(/\.(?=\s+[A-Z(]|$)/);
  return end === -1 ? plain : plain.slice(0, end + 1);
}

export function parseRevsetFunctions(help: string): RevsetFunction[] {
  const functions: RevsetFunction[] = [];
  let open: { name: string; params: string; lines: string[] } | undefined;

  const close = () => {
    if (!open) return;
    const about = firstSentence(open.lines.join(" "));
    functions.push({ name: open.name, params: open.params, about });
    open = undefined;
  };

  for (const line of help.split("\n")) {
    const opens = OPENS.exec(line);
    if (opens) {
      close();
      open = { name: opens[1]!, params: opens[2]!, lines: [opens[3]!] };
      continue;
    }
    if (!open) continue;
    const more = CONTINUES.exec(line);
    if (more) open.lines.push(more[1]!);
    else close();
  }
  close();

  // jj documents `parents(x, [depth])` once and `parents(x)` in the same
  // sentence; the first spelling is the one with every parameter, and it is the
  // one that opens the entry, so a duplicate name here would mean the help
  // gained a second entry rather than a second spelling.
  return functions.filter(
    (fn, index) => functions.findIndex((other) => other.name === fn.name) === index,
  );
}

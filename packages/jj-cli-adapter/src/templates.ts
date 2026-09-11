/**
 * jj template strings — the actual wire format of this adapter.
 *
 * Each template emits one JSON object per line (NDJSON). `json()` handles all
 * escaping, so a description containing quotes, newlines or CJK text survives
 * without a delimiter scheme. Verified against jj 0.43; `contract.test.ts`
 * re-verifies against whatever jj is on PATH, which is how a template change in
 * a future jj gets caught rather than silently mis-parsed.
 */

/**
 * One line per revision, over whatever expression yields the commit.
 *
 * Parameterised because `jj evolog` renders a `CommitEvolutionEntry`, not a
 * `Commit`: its keywords live behind `commit.`, and a bare `change_id` is a
 * parse error there. `self.` is the same thing spelled out in a `jj log`
 * context, so one body serves both and the two readings of a revision cannot
 * drift into disagreeing about what a revision is.
 */
function revisionTemplate(commit: string): string {
  return [
    '"{"',
    `"\\"changeId\\":" ++ json(${commit}.change_id())`,
    `",\\"commitId\\":" ++ json(${commit}.commit_id())`,
    `",\\"description\\":" ++ json(${commit}.description())`,
    `",\\"author\\":" ++ json(${commit}.author())`,
    `",\\"committer\\":" ++ json(${commit}.committer())`,
    // Parent *change* IDs: topology that survives a rebase.
    `",\\"parents\\":" ++ json(${commit}.parents().map(|c| c.change_id()))`,
    // Local names only: `bookmarks` also carries a remote-tracking row whose
    // target has drifted from the local one, and `b.name()` drops the `@origin`
    // that tells them apart — two identical pills on two different rows. The
    // split keeps this field the one the push and PR code already reads.
    `",\\"bookmarks\\":" ++ json(${commit}.local_bookmarks().map(|b| b.name()))`,
    // The drifted remote rows, as jj names them. `bookmarks` has done most of
    // the folding — a *tracked* remote at the same target, `@git` included, is
    // not in it — but an untracked one survives even at the same target, so
    // `normaliseRevision` drops those against the field above. `stringify`
    // because a `++` of strings is a template, which `json` will not serialize.
    `",\\"remoteBookmarks\\":" ++ json(${commit}.bookmarks().filter(|b| b.remote()).map(|b| stringify(b.name() ++ "@" ++ b.remote())))`,
    `",\\"tags\\":" ++ json(${commit}.tags().map(|t| t.name()))`,
    `",\\"isWorkingCopy\\":" ++ json(${commit}.current_working_copy())`,
    `",\\"isEmpty\\":" ++ json(${commit}.empty())`,
    `",\\"hasConflict\\":" ++ json(${commit}.conflict())`,
    `",\\"isImmutable\\":" ++ json(${commit}.immutable())`,
    `",\\"isDivergent\\":" ++ json(${commit}.divergent())`,
    // `signature` is an `Option<CryptographicSignature>`, which `json()`
    // refuses; the question the row asks is only whether there is one, and
    // `if` answers it as bare JSON the way the bookmark template's counts do.
    `",\\"isSigned\\":" ++ if(${commit}.signature(), "true", "false")`,
    '"}\\n"',
  ].join(" ++ ");
}

/** `jj log`, where the row *is* the commit. */
export const REVISION_TEMPLATE = revisionTemplate("self");

/** `jj evolog`, where the row is an evolution entry wrapping one. */
export const EVOLOG_TEMPLATE = revisionTemplate("commit");

/**
 * One line per bookmark row (one per local name, plus one per remote).
 *
 * `tracking_*_count` raises on an untracked ref, so both are guarded by
 * `tracked`; they are size hints, hence `.lower()`. `normal_target` is absent
 * for a conflicted or deleted bookmark, hence the `present` guard.
 */
export const BOOKMARK_TEMPLATE = [
  '"{"',
  '"\\"name\\":" ++ json(name)',
  '",\\"remote\\":" ++ json(remote)',
  '",\\"present\\":" ++ json(present)',
  '",\\"conflict\\":" ++ json(conflict)',
  '",\\"tracked\\":" ++ json(tracked)',
  '",\\"ahead\\":" ++ if(tracked, json(tracking_ahead_count.lower()), "null")',
  '",\\"behind\\":" ++ if(tracked, json(tracking_behind_count.lower()), "null")',
  '",\\"target\\":" ++ if(present, json(normal_target.change_id()), "null")',
  '"}\\n"',
].join(" ++ ");

/** One line per tag. Same `present` guard as the bookmark template. */
export const TAG_TEMPLATE = [
  '"{"',
  '"\\"name\\":" ++ json(name)',
  '",\\"target\\":" ++ if(present, json(normal_target.change_id()), "null")',
  '"}\\n"',
].join(" ++ ");

/**
 * One line per annotated line. `content` is a `ByteString`, which `json()`
 * renders as an array of bytes; `stringify` turns it back into text first.
 */
export const ANNOTATE_TEMPLATE = [
  '"{"',
  '"\\"changeId\\":" ++ json(commit.change_id())',
  '",\\"lineNumber\\":" ++ json(line_number)',
  '",\\"firstInHunk\\":" ++ json(first_line_in_hunk)',
  '",\\"author\\":" ++ json(commit.author())',
  '",\\"subject\\":" ++ json(commit.description().first_line())',
  '",\\"content\\":" ++ json(stringify(content))',
  '"}\\n"',
].join(" ++ ");

/** One line per operation. `attributes()` carries the `args: jj …` string. */
export const OPERATION_TEMPLATE = [
  '"{"',
  '"\\"id\\":" ++ json(id)',
  '",\\"description\\":" ++ json(description)',
  '",\\"time\\":" ++ json(time.end())',
  '",\\"user\\":" ++ json(user)',
  '",\\"attributes\\":" ++ json(self.attributes())',
  '",\\"isCurrent\\":" ++ json(current_operation)',
  '"}\\n"',
].join(" ++ ");

/** One line per workspace. */
export const WORKSPACE_TEMPLATE = [
  '"{"',
  '"\\"name\\":" ++ json(name)',
  '",\\"changeId\\":" ++ json(target.change_id())',
  '"}\\n"',
].join(" ++ ");

/**
 * One line per config variable.
 *
 * `name` is TOML dotted-key format, so a name jj had to quote arrives quoted —
 * `revset-aliases."a | all()"` — and the alias reader uses that as its signal
 * to skip the row. `value` is a `ConfigValue`, which `json()` renders in its
 * own type: a string for everything this app writes, but a hand-edited config
 * can hold a number or a table, hence the type check on the way out.
 */
export const CONFIG_TEMPLATE = [
  '"{"',
  '"\\"name\\":" ++ json(name)',
  '",\\"value\\":" ++ json(value)',
  '"}\\n"',
].join(" ++ ");

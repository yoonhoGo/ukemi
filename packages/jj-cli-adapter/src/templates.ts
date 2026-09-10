/**
 * jj template strings — the actual wire format of this adapter.
 *
 * Each template emits one JSON object per line (NDJSON). `json()` handles all
 * escaping, so a description containing quotes, newlines or CJK text survives
 * without a delimiter scheme. Verified against jj 0.43; `contract.test.ts`
 * re-verifies against whatever jj is on PATH, which is how a template change in
 * a future jj gets caught rather than silently mis-parsed.
 */

/** One line per revision. Field names match `Revision` exactly. */
export const REVISION_TEMPLATE = [
  '"{"',
  '"\\"changeId\\":" ++ json(change_id)',
  '",\\"commitId\\":" ++ json(commit_id)',
  '",\\"description\\":" ++ json(description)',
  '",\\"author\\":" ++ json(author)',
  '",\\"committer\\":" ++ json(committer)',
  // Parent *change* IDs: topology that survives a rebase.
  '",\\"parents\\":" ++ json(parents.map(|c| c.change_id()))',
  // Local names only: `bookmarks` also carries a remote-tracking row whose
  // target has drifted from the local one, and `b.name()` drops the `@origin`
  // that tells them apart — two identical pills on two different rows. The
  // split keeps this field the one the push and PR code already reads.
  '",\\"bookmarks\\":" ++ json(local_bookmarks.map(|b| b.name()))',
  // The drifted remote rows, as jj names them. `bookmarks` has done most of
  // the folding — a *tracked* remote at the same target, `@git` included, is
  // not in it — but an untracked one survives even at the same target, so
  // `normaliseRevision` drops those against the field above. `stringify`
  // because a `++` of strings is a template, which `json` will not serialize.
  '",\\"remoteBookmarks\\":" ++ json(bookmarks.filter(|b| b.remote()).map(|b| stringify(b.name() ++ "@" ++ b.remote())))',
  '",\\"tags\\":" ++ json(tags.map(|t| t.name()))',
  '",\\"isWorkingCopy\\":" ++ json(current_working_copy)',
  '",\\"isEmpty\\":" ++ json(empty)',
  '",\\"hasConflict\\":" ++ json(conflict)',
  '",\\"isImmutable\\":" ++ json(immutable)',
  '",\\"isDivergent\\":" ++ json(divergent)',
  '"}\\n"',
].join(" ++ ");

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

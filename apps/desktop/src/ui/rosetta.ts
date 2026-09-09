/**
 * The Git-to-jj lookup table behind ⌘G.
 *
 * The premise: a switcher does not need a tutorial, they need an answer at the
 * moment their fingers reach for a command that is not here. So the input is
 * the Git command they were about to type, verbatim, and the answer comes in
 * the order they need it — what to press in this window, what will actually
 * run, and only then why the two differ.
 *
 * `runs` uses the app's *own* spelling of each jj command (`--onto`,
 * `--from`/`--into`, `op restore`), so what the panel promises and what the
 * adapter executes cannot drift apart in wording. Every command here was
 * checked against jj 0.43, which is the version the sidecar pins.
 */

export interface RosettaStep {
  readonly label: string;
  readonly shortcut?: string;
}

export interface RosettaEntry {
  /** The Git command, in Git's spelling. Shown as the row's left column. */
  readonly git: string;
  /** Other Git spellings that should find this row. Never displayed. */
  readonly also?: readonly string[];
  /** What to do in this window. Empty when the answer is only a CLI one. */
  readonly steps: readonly RosettaStep[];
  /** The jj command(s) this actually becomes. */
  readonly runs: readonly string[];
  /** Why it is not a one-to-one swap. One sentence, and true. */
  readonly why: string;
}

export const ROSETTA: readonly RosettaEntry[] = [
  {
    git: 'git commit -m "…"',
    also: ["commit", "-am", "-a", "ci"],
    steps: [
      { label: "Type the description in the inspector", shortcut: "⌘↩" },
      { label: "Start the next change on top", shortcut: "⌘N" },
    ],
    runs: ['jj describe -m "…"', "jj new"],
    why:
      "-a has nothing to do here: every file you saved is already in @. And describing a change does not close it — jj new is what moves you off it, which is why this is two steps and git commit was one.",
  },
  {
    git: "git commit --amend",
    also: ["amend", "fixup"],
    steps: [{ label: "Edit the description in the inspector", shortcut: "⌘↩" }],
    runs: ['jj describe -m "…"'],
    why:
      "There is no amend because nothing was sealed. The change keeps its change ID through every edit, so this is not a rewrite that orphans anything.",
  },
  {
    git: "git add -p",
    also: ["add", "stage", "index", "-p", "--patch"],
    steps: [
      { label: "Split a change by hunk", shortcut: "⌘⇧S" },
      { label: "Squash hunks into the parent", shortcut: "⌘⇧K" },
    ],
    runs: ["jj split -r <rev>", "jj squash --from <rev> --into <rev>"],
    why:
      "There is no index to add to. The change already contains everything, so choosing what goes where happens afterwards instead of before — and it can be redone as often as you like.",
  },
  {
    git: "git status",
    also: ["st", "diff"],
    steps: [{ label: "Read the top row — it is @", shortcut: "↑" }],
    runs: ["jj status"],
    why:
      "The working copy is the first row of the graph, and the inspector beside it is its diff. Nothing is staged or unstaged, so there are no two lists to compare.",
  },
  {
    git: "git log --graph",
    also: ["log", "lg", "show"],
    steps: [{ label: "Focus the revset field", shortcut: "⌘L" }],
    runs: ["jj log -r <revset>"],
    why:
      "The window is the log. Revsets replace log's flags: one query language for the graph, the sidebar's saved views and every read the app makes.",
  },
  {
    git: "git checkout -b feat/x",
    also: ["switch -c", "branch", "new branch", "-b"],
    steps: [{ label: "Start a new change on top", shortcut: "⌘N" }],
    runs: ["jj new", "jj bookmark set feat/x -r @"],
    why:
      "New work needs no name — nothing is checked out and there is no current branch. Set a bookmark only if you want the name now; pushing a stack mints one for you either way.",
  },
  {
    git: "git checkout <rev>",
    also: ["switch", "detached head", "co"],
    steps: [{ label: "Edit the selected change", shortcut: "⌘E" }],
    runs: ["jj edit <rev>"],
    why:
      "No detached-HEAD warning, because @ moving is the normal case and not a state you can get stranded in. Your uncommitted work is not left behind: it is in the change you were on.",
  },
  {
    git: "git stash",
    also: ["stash pop", "stash list", "wip"],
    steps: [{ label: "Start a new change on top", shortcut: "⌘N" }],
    runs: ["jj new"],
    why:
      "There is no stash stack to lose things in. Park the mess in a change of its own and walk away; coming back is ⌘E on that row.",
  },
  {
    git: "git rebase -i",
    also: ["rebase", "squash", "reword", "interactive", "autosquash"],
    steps: [
      { label: "Drag a row onto its new parent", shortcut: "⌥" },
      { label: "Squash hunks into the parent", shortcut: "⌘⇧K" },
      { label: "Absorb into whatever last touched each line", shortcut: "⌘⇧A" },
    ],
    runs: ["jj rebase -r <rev> --onto <rev>", "jj absorb --from <rev>"],
    why:
      "There is no todo list because there is no sequence to step through: a rebase either happens or it does not, and a conflict is recorded rather than stopping it halfway.",
  },
  {
    git: "git rebase --abort",
    also: ["merge --abort", "abort", "cherry-pick --abort"],
    steps: [{ label: "Undo the last operation", shortcut: "⌘Z" }],
    runs: ["jj undo"],
    why:
      "Nothing is mid-flight to abort — the rebase finished and the conflict is data inside the commit. Undo reverses the whole operation if you would rather not have it.",
  },
  {
    git: "git reset --hard",
    also: ["reset", "reset --soft", "ORIG_HEAD"],
    steps: [{ label: "Undo the last operation", shortcut: "⌘Z" }],
    runs: ["jj undo", "jj restore <paths>"],
    why:
      "Undo reverses the last operation, not your files. To throw away edits to specific files instead, jj restore takes them back from the parent — and ⌘Z takes even that back.",
  },
  {
    git: "git reflog",
    also: ["reflog", "lost commits", "recover"],
    steps: [
      { label: "Move the operation playhead", shortcut: "←" },
      { label: "Restore to the parked operation", shortcut: "⌘⇧R" },
    ],
    runs: ["jj op log", "jj op restore <op>"],
    why:
      "The operation log records repository states, not ref movements, so restoring one puts everything back at once instead of you replaying each ref by hand.",
  },
  {
    git: "git push --force",
    also: ["push", "push -f", "force push", "push -u"],
    steps: [{ label: "Push the stack", shortcut: "⇧⌘P" }],
    runs: ["jj git push --change <rev>"],
    why:
      "There is no force to argue about: --change mints the bookmark on the first push and moves it after a rebase, so the same button covers create and update.",
  },
  {
    git: "git pull",
    also: ["pull", "fetch", "pull --rebase"],
    steps: [{ label: "Fetch", shortcut: "⇧⌘F" }],
    runs: ["jj git fetch"],
    why:
      "Fetch does not merge or rebase anything into your work — it only moves the remote bookmarks. Rebasing your stack onto the new trunk is a separate, visible step: ⌥ drag it.",
  },
  {
    git: "git merge <rev>",
    also: ["merge", "merge commit"],
    steps: [{ label: "Select both parents, then start a change", shortcut: "⌘N" }],
    runs: ["jj new <rev> <rev>"],
    why:
      "A merge is just a change with two parents, so you make one by starting a change on both instead of running a separate verb from one of them.",
  },
  {
    git: "git cherry-pick <rev>",
    also: ["cherry-pick", "pick"],
    steps: [],
    runs: ["jj duplicate <rev> --onto @"],
    why:
      "The copy is a new change with its own change ID, so the original and the copy stay distinguishable in the graph rather than being two commits that merely look alike.",
  },
  {
    git: "git revert <rev>",
    also: ["revert", "undo a commit"],
    steps: [],
    runs: ["jj revert -r <rev> --onto @"],
    why:
      "Reverting makes a new change that undoes the old one, exactly as in Git. Do not reach for ⌘Z here: that would undo your last operation, not the commit.",
  },
  {
    git: "git worktree add <path>",
    also: ["worktree", "parallel", "second checkout", "agent"],
    steps: [{ label: "Workspace board", shortcut: "⌘⇧W" }],
    runs: ["jj workspace add <path>"],
    why:
      "Workspaces share one operation log, so a second working copy — or an agent running in one — shows up on the same timeline instead of being a repo you have to remember about.",
  },
  {
    git: "git clean -fd",
    also: ["clean", "checkout -- .", "discard changes", "restore ."],
    steps: [{ label: "Abandon the selected change", shortcut: "⌘⌫" }],
    runs: ["jj restore", "jj abandon <rev>"],
    why:
      "Discarding is undoable here, which it never was in Git: restore rewrites the files and abandon drops the change, and ⌘Z brings either one back.",
  },
];

/**
 * Rank the table against what the user typed.
 *
 * Scored on how many of their words appear in a row's Git spellings, so a
 * partial command still lands somewhere useful and a fuller one (`commit
 * --amend`) beats the shorter row it shares a word with (`commit -m`). Quoted
 * text is dropped first: a commit message's words are not search terms, and
 * without this every `git commit -m "fix login"` would match the login-shaped
 * rows of some future table.
 *
 * An empty query returns the whole table in its authored order, which is the
 * reference sheet the panel shows before anything is typed.
 */
export function lookup(query: string, limit = ROSETTA.length): readonly RosettaEntry[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return ROSETTA.slice(0, limit);

  return ROSETTA.map((entry, index) => {
    const haystack = [entry.git, ...(entry.also ?? [])].join(" ").toLowerCase();
    let score = 0;
    for (const term of terms) if (haystack.includes(term)) score += 1;
    return { entry, index, score };
  })
    .filter((scored) => scored.score > 0)
    // Table order breaks ties, so the more common answer to an ambiguous query
    // is the one that sorts first — it is the order the sheet is authored in.
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((scored) => scored.entry);
}

/** The words worth matching on: no quoted text, no bare `git`, no punctuation-only bits. */
export function searchTerms(query: string): readonly string[] {
  return query
    .toLowerCase()
    .replace(/"[^"]*"?|'[^']*'?/g, " ")
    .replace(/[^a-z0-9\-./ ]+/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 0 && term !== "git" && term !== "jj" && term !== "-")
    .slice(0, 8);
}

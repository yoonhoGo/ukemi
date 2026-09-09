import type { ChangeId, Revision } from "@ukemi/domain";

/**
 * Colour palette keyed by change ID.
 *
 * Commit hashes change on every rebase; change IDs do not. Keying colour off
 * the change ID is what lets a node keep its identity while the operation
 * scrubber moves it around — the blob travels instead of blinking a new colour
 * (design §3-3).
 */
const PALETTE = [
  "#0a84ff",
  "#af52de",
  "#ff9f0a",
  "#5ac8fa",
  "#34c759",
  "#ff375f",
  "#5e5ce6",
  "#ffd60a",
] as const;

/** Stable, order-independent palette pick for any string key. */
function colorForKey(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]!;
}

export function colorForChange(changeId: ChangeId): string {
  return colorForKey(changeId);
}

/**
 * The colour an author chip is drawn in — keyed on the person, not the change,
 * so one glance down the graph groups everything the same person touched.
 * Email is the identity jj itself uses; the name is free text and drifts.
 */
export function authorColor(email: string): string {
  return colorForKey(email.trim().toLowerCase());
}

/**
 * The colour a revision's node is drawn in.
 *
 * Immutable revisions are deliberately colourless: they are someone else's
 * history and nothing you can act on, so they should recede rather than
 * compete with your own stack for attention.
 */
export function nodeColor(revision: Revision): string {
  if (revision.isImmutable) return "var(--u-immutable)";
  return colorForChange(revision.changeId);
}

/** Two-letter author chip, from the name when available and the email otherwise. */
export function authorInitials(name: string, email: string): string {
  const source = name.trim() || email.split("@")[0] || "?";
  const words = source.split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0]![0]! + words[1]![0]!).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

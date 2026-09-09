/**
 * Relative time for revision and operation rows.
 *
 * Deliberately coarse: in a repo you are actively working in, "12m" and "3h"
 * are the useful distinctions, and anything older than a week is better as a
 * date than as "43d". Falls back to the raw string if jj ever hands us a
 * timestamp we cannot parse, so a format change shows the value rather than
 * "Invalid Date".
 */
export function relativeTime(timestamp: string, now = Date.now()): string {
  const then = Date.parse(timestamp);
  if (Number.isNaN(then)) return timestamp;

  const seconds = Math.round((now - then) / 1000);
  if (seconds < 45) return "now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Clock time for the operation timeline's axis labels. */
export function clockTime(timestamp: string): string {
  const then = Date.parse(timestamp);
  if (Number.isNaN(then)) return "";
  return new Date(then).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

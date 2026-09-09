/**
 * Relative time for revision and operation rows.
 *
 * Deliberately coarse: in a repo you are actively working in, "12m" and "3h"
 * are the useful distinctions, and anything older than a week is better as a
 * date than as "43d". Falls back to the raw string if jj ever hands us a
 * timestamp we cannot parse, so a format change shows the value rather than
 * "Invalid Date".
 *
 * Translated by unit rather than through `Intl.RelativeTimeFormat`: the format
 * is terse on purpose — these sit in a right-aligned column — and "3 hours ago"
 * is not the same design as "3h".
 */
import { currentLocale, t } from "../i18n/i18n.ts";

export function relativeTime(timestamp: string, now = Date.now()): string {
  const then = Date.parse(timestamp);
  if (Number.isNaN(then)) return timestamp;

  const seconds = Math.round((now - then) / 1000);
  if (seconds < 45) return t("now");
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t("{count}m", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("{count}h", { count: hours });
  const days = Math.round(hours / 24);
  if (days === 1) return t("yesterday");
  if (days < 7) return t("{count}d", { count: days });
  return new Date(then).toLocaleDateString(currentLocale(), {
    month: "short",
    day: "numeric",
  });
}

/** Clock time for the operation timeline's axis labels. */
export function clockTime(timestamp: string): string {
  const then = Date.parse(timestamp);
  if (Number.isNaN(then)) return "";
  return new Date(then).toLocaleTimeString(currentLocale(), {
    hour: "2-digit",
    minute: "2-digit",
  });
}

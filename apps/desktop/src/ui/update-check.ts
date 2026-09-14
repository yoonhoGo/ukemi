/**
 * "Is there a newer Ukemi?" — asked once per launch, and only if you said so.
 *
 * Off by default, and the one request that ever leaves this window. The CSP
 * blocks every remote load a theme or a diff could try (`themes/themes.ts`),
 * so an app that phoned home on its own would be the single exception to a
 * property the rest of the window is built to have. Settings is where you
 * turn it on.
 *
 * Deliberately not `tauri-plugin-updater`. That wants a signing keypair, a
 * `latest.json` the release workflow has to publish alongside a second bundle
 * target, and two more Rust dependencies — to replace a `curl … | sh` the
 * install already used once. This asks GitHub for the latest tag and hands
 * back that same command; `install.sh` does the update the way it did the
 * install. See `DECISIONS.md`.
 */

const LATEST = "https://api.github.com/repos/yoonhoGo/ukemi/releases/latest";

/** What the banner offers to copy — the same line `README.md` documents. */
export const INSTALL_COMMAND =
  "curl -fsSL https://raw.githubusercontent.com/yoonhoGo/ukemi/main/install.sh | sh";

const KEY = "ukemi:update-check";

export function updateCheckEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    // No storage: the check stays off, which is the default anyway.
    return false;
  }
}

export function setUpdateCheckEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // The choice just will not persist; not worth interrupting the user.
  }
}

/** `v0.8.0` or `0.8.0` as three numbers, or nothing if it is neither. */
function parse(version: string): readonly [number, number, number] | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

/**
 * Whether `latest` is a release the running `current` does not have.
 *
 * A tag this cannot read is not an update: the versioning scheme is fixed at
 * `0.MINOR.PATCH` (README § Versioning), so anything else is a tag that is not
 * a release, and telling the user to reinstall over one would be a bug.
 */
export function isNewer(latest: string, current: string): boolean {
  const a = parse(latest);
  const b = parse(current);
  if (!a || !b) return false;
  for (let index = 0; index < 3; index += 1) {
    if (a[index]! !== b[index]!) return a[index]! > b[index]!;
  }
  return false;
}

let asked: Promise<string | undefined> | undefined;

/**
 * The latest release tag, asked for at most once per launch.
 *
 * Both the startup banner and the Settings row want the answer, and the second
 * one exists so that switching the toggle on says something immediately rather
 * than promising a result at the next launch. Memoised so that is still one
 * request.
 */
export function latestRelease(): Promise<string | undefined> {
  asked ??= fetch(LATEST, { headers: { accept: "application/vnd.github+json" } })
    .then((response) => (response.ok ? response.json() : undefined))
    .then((body: { tag_name?: unknown } | undefined) =>
      typeof body?.tag_name === "string" ? body.tag_name : undefined,
    )
    .catch(() => undefined); // Offline, rate-limited, DNS — all the same answer.
  return asked;
}

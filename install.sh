#!/bin/sh
# Install Ukemi from its GitHub Releases, and a `ukemi` command that opens a
# repository folder in it.
#
#     curl -fsSL https://raw.githubusercontent.com/yoonhoGo/ukemi/main/install.sh | sh
#
# Run it again to update; there is no separate updater. The release DMG is
# ad-hoc signed and not notarised (README § Versioning), so this clears the
# quarantine flag the download puts on it — the same `xattr -dr` the README
# otherwise asks you to run by hand. Nothing here needs sudo: the command goes
# to /usr/local/bin when that is writable and ~/.local/bin when it is not.
#
# UKEMI_VERSION pins a release, UKEMI_APPS moves the app, UKEMI_BIN moves the
# command.
set -eu

REPO=yoonhoGo/ukemi
APPS=${UKEMI_APPS:-/Applications}

die() {
  echo "ukemi: $*" >&2
  exit 1
}

[ "$(uname -s)" = Darwin ] || die "macOS only — the release builds a .dmg and nothing else."
[ "$(uname -m)" = arm64 ] || die "Apple silicon only; the release has no x86_64 build."
[ -w "$APPS" ] || die "$APPS is not writable. Set UKEMI_APPS=\$HOME/Applications, or run with sudo."

# The tag is `v` + the version in tauri.conf.json, and the DMG is named after
# the version alone, so the leading `v` is stripped here rather than twice below.
version=${UKEMI_VERSION:-}
if [ -z "$version" ]; then
  version=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" |
    sed -n 's/.*"tag_name" *: *"v\{0,1\}\([^"]*\)".*/\1/p' | head -1)
fi
[ -n "$version" ] || die "could not work out the latest version; set UKEMI_VERSION."

dmg=Ukemi_${version}_aarch64.dmg
work=$(mktemp -d)
mount=$work/mnt

cleanup() {
  if [ -d "$mount" ]; then
    hdiutil detach "$mount" -quiet >/dev/null 2>&1 || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT INT TERM

echo "ukemi: downloading $dmg"
curl -fL --progress-bar -o "$work/$dmg" \
  "https://github.com/$REPO/releases/download/v$version/$dmg"

mkdir -p "$mount"
hdiutil attach "$work/$dmg" -mountpoint "$mount" -nobrowse -quiet
rm -rf "${APPS:?}/Ukemi.app"
ditto "$mount/Ukemi.app" "$APPS/Ukemi.app"
xattr -dr com.apple.quarantine "$APPS/Ukemi.app" 2>/dev/null || true

# No sudo: /usr/local/bin when it is there and writable, ~/.local/bin when it
# is not. UKEMI_BIN overrides both, which is also how this script is tested.
bin=${UKEMI_BIN:-}
if [ -z "$bin" ]; then
  bin=/usr/local/bin
  { [ -d "$bin" ] && [ -w "$bin" ]; } || bin=$HOME/.local/bin
fi
mkdir -p "$bin"

# `open -n` rather than the binary inside the bundle: it detaches from the
# terminal, activates the window, and — being a *new* instance — actually
# delivers argv, which a plain `open` on an already-running app does not. One
# window is one repository, so a second repo wanting a second process is right.
cat > "$bin/ukemi" <<EOF
#!/bin/sh
# Open a repository folder in Ukemi. Written by install.sh; edit at will.
set -eu
exec open -n -a "$APPS/Ukemi.app" --args "\$(cd "\${1:-.}" && pwd)"
EOF
chmod +x "$bin/ukemi"

echo "ukemi: installed $version to $APPS/Ukemi.app, command at $bin/ukemi"
case ":$PATH:" in
  *":$bin:"*) echo "ukemi: run \`ukemi\` in a repository." ;;
  *) echo "ukemi: add it to your PATH — export PATH=\"$bin:\$PATH\"" ;;
esac

#!/bin/bash
set -euo pipefail

REPOSITORY="aidenbuildsthings/helios"
VERSION="${HELIOS_VERSION:-0.2.4}"
RELEASE_ROOT="https://github.com/$REPOSITORY/releases/download/v$VERSION"
ARCHIVE_NAME="helios-$VERSION.tar.gz"
ARCHIVE_URL="$RELEASE_ROOT/$ARCHIVE_NAME"
INSTALL_ROOT="${HELIOS_INSTALL_DIR:-$HOME/.local/share/helios}"
BIN_DIR="${HELIOS_BIN_DIR:-$HOME/.local/bin}"
BIN_PATH="$BIN_DIR/helios"

command -v curl >/dev/null 2>&1 || { echo "Helios requires curl."; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Helios requires Node.js 22.5 or newer."; exit 1; }
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Helios requires Node.js 22.5 or newer (found $(node --version))."
  exit 1
fi

mkdir -p "$INSTALL_ROOT" "$BIN_DIR"
DOWNLOAD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/helios-download.XXXXXX")"
STAGING_DIR="$(mktemp -d "$INSTALL_ROOT/.install.XXXXXX")"
trap 'rm -rf "$DOWNLOAD_DIR" "$STAGING_DIR"' EXIT

echo "Downloading Helios v${VERSION}..."
curl --fail --silent --show-error --location "$ARCHIVE_URL" --output "$DOWNLOAD_DIR/helios.tar.gz"
curl --fail --silent --show-error --location "$RELEASE_ROOT/SHA256SUMS" --output "$DOWNLOAD_DIR/SHA256SUMS"
EXPECTED_SHA="$(awk -v file="$ARCHIVE_NAME" '$2 == file {print $1}' "$DOWNLOAD_DIR/SHA256SUMS")"
if [ -z "$EXPECTED_SHA" ]; then echo "Release checksum is missing for $ARCHIVE_NAME."; exit 1; fi
if command -v sha256sum >/dev/null 2>&1; then ACTUAL_SHA="$(sha256sum "$DOWNLOAD_DIR/helios.tar.gz" | awk '{print $1}')"; else ACTUAL_SHA="$(shasum -a 256 "$DOWNLOAD_DIR/helios.tar.gz" | awk '{print $1}')"; fi
if [ "$EXPECTED_SHA" != "$ACTUAL_SHA" ]; then echo "Helios archive checksum verification failed."; exit 1; fi
tar -xzf "$DOWNLOAD_DIR/helios.tar.gz" -C "$DOWNLOAD_DIR"
SOURCE_DIR="$DOWNLOAD_DIR/helios-$VERSION"

cp "$SOURCE_DIR/package.json" "$SOURCE_DIR/package-lock.json" "$SOURCE_DIR/README.md" "$STAGING_DIR"/
cp -R "$SOURCE_DIR/src" "$SOURCE_DIR/browser-extension" "$STAGING_DIR"/
(
  cd "$STAGING_DIR"
  npm_config_cache="$INSTALL_ROOT/.npm-cache" npm install --omit=dev --ignore-scripts --no-audit --no-fund
)
chmod 755 "$STAGING_DIR/src/cli.mjs"

FINAL_DIR="$INSTALL_ROOT/$VERSION-$(date +%Y%m%d%H%M%S)"
mv "$STAGING_DIR" "$FINAL_DIR"
if [ -e "$BIN_PATH" ] && [ ! -L "$BIN_PATH" ]; then
  BACKUP="$BIN_PATH.before-helios-$(date +%Y%m%d%H%M%S)"
  mv "$BIN_PATH" "$BACKUP"
  echo "Preserved the previous executable at $BACKUP"
fi
NEXT_BIN="$BIN_DIR/.helios-$PPID-$$"
ln -s "$FINAL_DIR/src/cli.mjs" "$NEXT_BIN"
mv -f "$NEXT_BIN" "$BIN_PATH"

echo
echo "Helios v$VERSION installed."
echo "Run: helios onboard"

#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
VERSION="$(node -p "require('$ROOT/../package.json').version")"
ARCH="$(uname -m)"
OUT="$ROOT/dist"
STAGING="$(mktemp -d "${TMPDIR:-/tmp}/helios-desktop.XXXXXX")"
trap 'rm -rf "$STAGING"' EXIT
APP="$STAGING/Helios.app"
CACHE="$STAGING/module-cache"
mkdir -p "$OUT" "$APP/Contents/MacOS" "$APP/Contents/Resources/Resources" "$CACHE"
swiftc "$ROOT/Sources/main.swift" -O -module-cache-path "$CACHE" -framework Cocoa -framework WebKit -o "$APP/Contents/MacOS/Helios"
cp "$ROOT/Resources/index.html" "$ROOT/Resources/style.css" "$ROOT/Resources/app.js" "$APP/Contents/Resources/Resources/"
sed "s/__VERSION__/$VERSION/g" "$ROOT/Info.plist" > "$APP/Contents/Info.plist"
xattr -cr "$APP"
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"
if [[ "${1:-}" == "--app-only" ]]; then
  rm -rf "$OUT/Helios.app"
  ditto "$APP" "$OUT/Helios.app"
  echo "$OUT/Helios.app"
  exit 0
fi
hdiutil create -volname "Helios Desktop" -srcfolder "$APP" -ov -format UDZO "$OUT/Helios-Desktop-$VERSION-$ARCH.dmg"
echo "$OUT/Helios-Desktop-$VERSION-$ARCH.dmg"

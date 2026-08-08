#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
VERSION="${HELIOS_DESKTOP_VERSION:-$(node -p "require('$ROOT/version.json').version")}"
ARCH="universal"
OUT="$ROOT/dist"
STAGING="$(mktemp -d "${TMPDIR:-/tmp}/helios-desktop.XXXXXX")"
trap 'rm -rf "$STAGING"' EXIT
APP="$STAGING/Helios.app"
CACHE_ARM="$STAGING/module-cache-arm64"
CACHE_X64="$STAGING/module-cache-x86_64"
mkdir -p "$OUT" "$APP/Contents/MacOS" "$APP/Contents/Resources/Resources" "$CACHE_ARM" "$CACHE_X64"
swiftc "$ROOT/Sources/main.swift" -O -target arm64-apple-macos13.0 -module-cache-path "$CACHE_ARM" -framework Cocoa -framework WebKit -o "$STAGING/Helios-arm64"
swiftc "$ROOT/Sources/main.swift" -O -target x86_64-apple-macos13.0 -module-cache-path "$CACHE_X64" -framework Cocoa -framework WebKit -o "$STAGING/Helios-x86_64"
lipo -create "$STAGING/Helios-arm64" "$STAGING/Helios-x86_64" -output "$APP/Contents/MacOS/Helios"
cp "$ROOT/Resources/index.html" "$ROOT/Resources/style.css" "$ROOT/Resources/app.js" "$APP/Contents/Resources/Resources/"
ICONSET="$STAGING/Helios.iconset"
mkdir -p "$ICONSET"
for SPEC in "16 icon_16x16.png" "32 icon_16x16@2x.png" "32 icon_32x32.png" "64 icon_32x32@2x.png" "128 icon_128x128.png" "256 icon_128x128@2x.png" "256 icon_256x256.png" "512 icon_256x256@2x.png" "512 icon_512x512.png" "1024 icon_512x512@2x.png"; do
  read -r SIZE NAME <<< "$SPEC"
  sips -s format png -z "$SIZE" "$SIZE" "$ROOT/Assets/HeliosIcon.png" --out "$ICONSET/$NAME" >/dev/null
done
node "$ROOT/make-icon.mjs" "$ICONSET" "$APP/Contents/Resources/Helios.icns"
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
DMG_ROOT="$STAGING/dmg"
mkdir -p "$DMG_ROOT"
ditto "$APP" "$DMG_ROOT/Helios.app"
ln -s /Applications "$DMG_ROOT/Applications"
hdiutil create -volname "Helios Desktop" -srcfolder "$DMG_ROOT" -ov -format UDZO "$OUT/Helios-Desktop-$VERSION-$ARCH.dmg"
echo "$OUT/Helios-Desktop-$VERSION-$ARCH.dmg"

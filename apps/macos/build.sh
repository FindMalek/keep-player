#!/bin/sh
# Builds "lodesong.app" (universal: Apple silicon and Intel) into apps/macos/dist. Unsigned: the first launch needs a
# right-click → Open, or `xattr -dr com.apple.quarantine "lodesong.app"`.
set -eu
cd "$(dirname "$0")"
VERSION=$(node -p "require('../../package.json').version" 2>/dev/null || echo 0.0.0)
swift build -c release --arch arm64 --arch x86_64
APP="dist/lodesong.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp .build/apple/Products/Release/Lodesong "$APP/Contents/MacOS/lodesong"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>lodesong</string>
  <key>CFBundleDisplayName</key><string>lodesong</string>
  <key>CFBundleIdentifier</key><string>engineer.findmalek.lodesong</string>
  <key>CFBundleExecutable</key><string>lodesong</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.music</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSSupportsAutomaticTermination</key><false/>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict>
</plist>
PLIST
# The icon, drawn by scripts/icon.swift at every size macOS asks for.
ICONSET=$(mktemp -d)/AppIcon.iconset
mkdir -p "$ICONSET"
swift scripts/icon.swift "$ICONSET/icon_512x512@2x.png"
for size in 16 32 128 256 512; do
  sips -z $size $size "$ICONSET/icon_512x512@2x.png" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  [ $size -ne 512 ] && sips -z $double $double "$ICONSET/icon_512x512@2x.png" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
codesign --force --sign - "$APP"
echo "$APP"

#!/bin/sh
# Builds "keep music.app" (universal: Apple silicon and Intel) into apps/macos/dist. Unsigned: the first launch needs a
# right-click → Open, or `xattr -dr com.apple.quarantine "keep music.app"`.
set -eu
cd "$(dirname "$0")"
VERSION=$(node -p "require('../../package.json').version" 2>/dev/null || echo 0.0.0)
swift build -c release --arch arm64 --arch x86_64
APP="dist/keep music.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp .build/apple/Products/Release/KeepMusic "$APP/Contents/MacOS/keep music"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>keep music</string>
  <key>CFBundleDisplayName</key><string>keep music</string>
  <key>CFBundleIdentifier</key><string>engineer.findmalek.keep-music</string>
  <key>CFBundleExecutable</key><string>keep music</string>
  <key>CFBundlePackageType</key><string>APPL</string>
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
codesign --force --sign - "$APP"
echo "$APP"

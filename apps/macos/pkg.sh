#!/bin/sh
# Wraps dist/lodesong.app (from build.sh) in lodesong-macos.pkg, the format MDM tools like Fleet install.
# Set SIGN_ID to a "Developer ID Installer: ..." identity to sign it.
set -eu
cd "$(dirname "$0")"
VERSION=$(node -p "require('../../package.json').version" 2>/dev/null || echo 0.0.0)
ROOT=$(mktemp -d)
ditto dist/lodesong.app "$ROOT/lodesong.app"
set -- --root "$ROOT" --install-location /Applications --identifier engineer.findmalek.lodesong --version "$VERSION"
[ -n "${SIGN_ID:-}" ] && set -- "$@" --sign "$SIGN_ID"
pkgbuild "$@" dist/lodesong-macos.pkg
rm -rf "$ROOT"
echo dist/lodesong-macos.pkg

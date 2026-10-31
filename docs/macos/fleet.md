# Deploy the macOS app with Fleet

`apps/macos/pkg.sh` wraps the built app in `lodesong-macos.pkg`, which installs `lodesong.app` into `/Applications`,
what Fleet (and any MDM) wants.

```sh
apps/macos/build.sh && apps/macos/pkg.sh   # → apps/macos/dist/lodesong-macos.pkg
```

## Add it to Fleet

1. Build the pkg (above).
2. Fleet → **Software** → **Add software** → **Custom package**, pick the team and upload the file. Fleet reads the
   bundle id (`engineer.findmalek.lodesong`) and version from it.
3. Leave the default install script, or set **self-service** so people can install it from Fleet Desktop.
4. Optional uninstall script:

```sh
pkill -x lodesong || true
rm -rf "/Applications/lodesong.app"
pkgutil --forget engineer.findmalek.lodesong || true
```

With GitOps, host the pkg somewhere your Fleet can fetch and add its URL under `software.packages` in the team yaml.

## Gatekeeper

The app is ad-hoc signed, not notarized. A package that Fleet installs through MDM isn't quarantined, so it opens
without the right-click → Open step. If your devices block unidentified developers by policy, sign with your own
identity instead:

```sh
apps/macos/build.sh
SIGN_ID="Developer ID Installer: Your Company (TEAMID)" apps/macos/pkg.sh
```

## Updates

The app updates itself from GitHub releases. To pin the version your fleet runs, turn automatic downloads off in
Settings (⌘,) and upload the new `.pkg` to Fleet when you want to roll it out.

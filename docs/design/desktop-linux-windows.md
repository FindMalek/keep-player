# Desktop app for Linux and Windows

Plan for [#309](https://github.com/FindMalek/lodesong/issues/309). The mac app (`apps/macos`) is the player in a native
window plus an island and a mini player. Linux and Windows get the same idea from one codebase.

## Choice: Tauri 2

- One Rust shell for both systems, on the system webview (WebView2, WebKitGTK), so installers stay small.
- Same contract as the mac app: the page already talks to its host through `apps/player/src/lib/native.ts`; the Tauri
  shell implements that bridge with `invoke` and events instead of WKWebView messages.
- Electron would also work but ships a whole Chromium for a window around a web page.

## Scope for a first release

| feature | Linux | Windows |
|---|---|---|
| window around the player, login kept between launches | WebKitGTK profile dir | WebView2 user data folder |
| media keys and now playing | MPRIS (D-Bus) | SMTC |
| mini player that stays on top | small always-on-top window | same |
| tray icon with play, next, quit | AppIndicator | system tray |
| closing keeps the music going | hide to tray | hide to tray |
| updates | `tauri-plugin-updater` against GitHub releases | same |
| asks for the lodesong address once | same first-run page as mac | same |

The notch island stays mac only.

## Layout

`apps/desktop/`: a Tauri project with no frontend of its own, it loads the user's lodesong address. Bridge messages stay
defined once in `apps/player/src/lib/native.ts`; each shell only maps them.

## CI and release

- the release gets a matrix: `ubuntu-24.04` (`.deb`, `.AppImage`) and `windows-latest` (`.msi`, `.exe`), uploaded like
  the mac zip.
- Windows signing needs a certificate (or Azure Trusted Signing); until then SmartScreen warns on first run.
- Desktop jobs must not block a web release.

## Open questions

- Does Web Audio (analyser bars, EQ, gapless) behave the same on WebKitGTK? Spike first: play, seek, gapless, EQ.
- Start at login: optional, off by default.

## Order of work

1. spike: window loads the player, audio plays, login persists
2. bridge: media keys and now playing
3. mini player and tray
4. updater and release matrix
5. install guide

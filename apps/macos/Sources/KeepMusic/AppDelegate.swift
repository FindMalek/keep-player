import AppKit
import SwiftUI

/// The player in a window (closing it keeps the music going), the island in the notch, a mini player and a menu bar
/// item for Macs without one.
@MainActor final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    let nowPlaying = NowPlaying()
    let preferences = Preferences.shared
    let updater = Updater()
    private var window: NSWindow?
    private var player: PlayerView?
    private var mini: NSPanel?
    private var notch: NotchController?
    private var statusItem: StatusItem?

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        if let server = preferences.server { open(server) } else { askForServer() }
        notch = NotchController(nowPlaying: nowPlaying, preferences: preferences) { [weak self] in self?.showWindow() }
        statusItem = StatusItem(nowPlaying: nowPlaying, preferences: preferences)
        updater.onReady = { [weak self] version in self?.offerRestart(version) }
        updater.start()
        WhatsNew.showIfUpdated()
    }

    /// A new version is downloaded: ask once; "Later" leaves "Restart to Update" in the app menu.
    private func offerRestart(_ version: String) {
        buildMenu()
        let alert = NSAlert()
        alert.icon = NSApp.applicationIconImage
        alert.messageText = "keep music \(version) is ready"
        alert.informativeText = "Restart to finish updating. What's new shows when it opens again."
        alert.addButton(withTitle: "Restart Now")
        alert.addButton(withTitle: "Later")
        if alert.runModal() == .alertFirstButtonReturn { updater.restart() }
    }

    @objc func restartToUpdate() { updater.restart() }
    @objc func checkForUpdates() { Task { await updater.check(userInitiated: true) } }
    @objc func showSettings() { SettingsWindow.show(preferences: preferences, updater: updater) }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool {
        showWindow()
        return true
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        guard sender === window else { return true }
        sender.orderOut(nil)
        return false
    }

    private func open(_ server: URL) {
        let player = PlayerView(server: server, nowPlaying: nowPlaying)
        self.player = player
        let window = window ?? NSWindow(
            contentRect: CGRect(x: 0, y: 0, width: 1280, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false)
        window.title = "keep music"
        window.tabbingMode = .disallowed
        window.contentView = player.webView
        window.delegate = self
        if !window.setFrameUsingName("main") { window.center() }
        window.setFrameAutosaveName("main")
        window.makeKeyAndOrderFront(nil)
        self.window = window
    }

    private func askForServer() {
        let alert = NSAlert()
        alert.messageText = "Where is your keep music?"
        alert.informativeText = "The address you open it at in a browser."
        let field = NSTextField(frame: CGRect(x: 0, y: 0, width: 320, height: 24))
        field.placeholderString = "https://music.example.com"
        field.stringValue = preferences.server?.absoluteString ?? ""
        alert.accessoryView = field
        alert.addButton(withTitle: "Open")
        alert.addButton(withTitle: preferences.server == nil ? "Quit" : "Cancel")
        alert.window.initialFirstResponder = field
        guard alert.runModal() == .alertFirstButtonReturn,
              let url = URL(string: field.stringValue.trimmingCharacters(in: .whitespaces)),
              url.scheme == "https" || url.scheme == "http", url.host != nil
        else {
            if preferences.server == nil { NSApp.terminate(nil) }
            return
        }
        preferences.server = url
        open(url)
    }

    @objc func showWindow() {
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
    }

    @objc func toggleMini() {
        if let mini, mini.isVisible {
            mini.orderOut(nil)
            return
        }
        let panel = mini ?? MiniPlayer.panel(nowPlaying: nowPlaying)
        mini = panel
        panel.orderFrontRegardless()
    }

    @objc func changeServer() { askForServer() }
    @objc func togglePlay() { nowPlaying.toggle() }
    @objc func nextSong() { nowPlaying.next() }
    @objc func previousSong() { nowPlaying.previous() }

    private func buildMenu() {
        let main = NSMenu()
        func submenu(_ title: String, _ items: [NSMenuItem]) {
            let holder = NSMenuItem()
            let menu = NSMenu(title: title)
            items.forEach(menu.addItem)
            holder.submenu = menu
            main.addItem(holder)
        }
        func item(_ title: String, _ action: Selector, _ key: String = "", _ modifiers: NSEvent.ModifierFlags = .command) -> NSMenuItem {
            let entry = NSMenuItem(title: title, action: action, keyEquivalent: key)
            entry.keyEquivalentModifierMask = modifiers
            return entry
        }
        var appItems = [
            item("About keep music", #selector(NSApplication.orderFrontStandardAboutPanel(_:))),
            item("Check for Updates…", #selector(checkForUpdates)),
        ]
        if case let .ready(version) = updater.state { appItems.append(item("Restart to Update to \(version)", #selector(restartToUpdate))) }
        submenu("keep music", appItems + [
            .separator(),
            item("Settings…", #selector(showSettings), ","),
            .separator(),
            item("Change Server…", #selector(changeServer)),
            .separator(),
            item("Hide keep music", #selector(NSApplication.hide(_:)), "h"),
            item("Quit keep music", #selector(NSApplication.terminate(_:)), "q"),
        ])
        submenu("Edit", [
            item("Undo", Selector(("undo:")), "z"),
            item("Redo", Selector(("redo:")), "z", [.command, .shift]),
            .separator(),
            item("Cut", #selector(NSText.cut(_:)), "x"),
            item("Copy", #selector(NSText.copy(_:)), "c"),
            item("Paste", #selector(NSText.paste(_:)), "v"),
            item("Select All", #selector(NSText.selectAll(_:)), "a"),
        ])
        submenu("Controls", [
            item("Play / Pause", #selector(togglePlay), " ", []),
            item("Next", #selector(nextSong), String(UnicodeScalar(NSRightArrowFunctionKey)!), .command),
            item("Previous", #selector(previousSong), String(UnicodeScalar(NSLeftArrowFunctionKey)!), .command),
        ])
        let windows = [
            item("keep music", #selector(showWindow), "1"),
            item("Mini Player", #selector(toggleMini), "m", [.command, .shift]),
            .separator(),
            item("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"),
            item("Close", #selector(NSWindow.performClose(_:)), "w"),
        ]
        submenu("Window", windows)
        NSApp.mainMenu = main
        NSApp.windowsMenu = main.items.last?.submenu
    }
}

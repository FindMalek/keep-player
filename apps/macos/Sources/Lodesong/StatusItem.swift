import AppKit
import Observation

/// The menu bar item (off by default where the notch is): a note, and a menu with the song and its controls, filled in
/// only when it opens.
@MainActor final class StatusItem: NSObject, NSMenuDelegate {
    private let nowPlaying: NowPlaying
    private let preferences: Preferences
    private var item: NSStatusItem?

    init(nowPlaying: NowPlaying, preferences: Preferences) {
        self.nowPlaying = nowPlaying
        self.preferences = preferences
        super.init()
        watch()
    }

    private func watch() {
        withObservationTracking { _ = preferences.menuBarItem } onChange: { [weak self] in
            Task { @MainActor in
                self?.update()
                self?.watch()
            }
        }
        update()
    }

    private func update() {
        guard preferences.menuBarItem else {
            if let item { NSStatusBar.system.removeStatusItem(item) }
            item = nil
            return
        }
        guard item == nil else { return }
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = NSImage(systemSymbolName: "music.note", accessibilityDescription: "lodesong")
        let menu = NSMenu()
        menu.delegate = self
        item.menu = menu
        self.item = item
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        if let title = nowPlaying.title {
            let song = NSMenuItem(title: title, action: nil, keyEquivalent: "")
            song.isEnabled = false
            menu.addItem(song)
            if !nowPlaying.artist.isEmpty {
                let artist = NSMenuItem(title: nowPlaying.artist, action: nil, keyEquivalent: "")
                artist.isEnabled = false
                menu.addItem(artist)
            }
            menu.addItem(.separator())
            menu.addItem(entry(nowPlaying.playing ? "Pause" : "Play", #selector(toggle)))
            menu.addItem(entry("Next", #selector(next)))
            menu.addItem(entry("Previous", #selector(previous)))
            menu.addItem(.separator())
        }
        menu.addItem(withTitle: "Open lodesong", action: #selector(AppDelegate.showWindow), keyEquivalent: "")
        menu.addItem(withTitle: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "")
    }

    private func entry(_ title: String, _ action: Selector) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
        item.target = self
        return item
    }

    @objc private func toggle() { nowPlaying.toggle() }
    @objc private func next() { nowPlaying.next() }
    @objc private func previous() { nowPlaying.previous() }
}

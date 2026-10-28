import AppKit
import Observation
import SwiftUI

/// The island's window: borderless, above the menu bar, on every space and over full-screen apps, sized for the
/// largest state and centered on the notch. Clicks outside the black shape go through to whatever is under it (the
/// window is transparent there). It exists only while there is a notch, the setting is on and a song is loaded.
@MainActor final class NotchController {
    private let nowPlaying: NowPlaying
    private let preferences: Preferences
    private let state = IslandState()
    private var panel: NSPanel?
    private let openPlayer: () -> Void

    init(nowPlaying: NowPlaying, preferences: Preferences, openPlayer: @escaping () -> Void) {
        self.nowPlaying = nowPlaying
        self.preferences = preferences
        self.openPlayer = openPlayer
        NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.update() }
        }
        watch()
    }

    /// Re-run `update` whenever something it reads changes; no timers.
    private func watch() {
        withObservationTracking {
            _ = (nowPlaying.hasSong, nowPlaying.playing, preferences.notch, preferences.notchWhilePaused)
        } onChange: { [weak self] in
            Task { @MainActor in
                self?.update()
                self?.watch()
            }
        }
        update()
    }

    private var notchScreen: NSScreen? { NSScreen.screens.first { $0.safeAreaInsets.top > 0 } }

    private func update() {
        let wanted = preferences.notch && nowPlaying.hasSong && (nowPlaying.playing || preferences.notchWhilePaused)
        LevelMeter.shared.want("island", wanted && nowPlaying.playing && notchScreen != nil)
        guard wanted, let screen = notchScreen else {
            panel?.orderOut(nil)
            state.mode = .compact
            return
        }
        let panel = self.panel ?? makePanel()
        self.panel = panel
        place(panel, on: screen)
        panel.orderFrontRegardless()
    }

    private func makePanel() -> NSPanel {
        let panel = NSPanel(
            contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = .statusBar + 1
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]
        panel.isMovable = false
        panel.becomesKeyOnlyIfNeeded = true
        panel.hidesOnDeactivate = false
        let view = IslandView(state: state, nowPlaying: nowPlaying, preferences: preferences, openPlayer: openPlayer)
        let hosting = NSHostingView(rootView: view)
        hosting.sizingOptions = []
        panel.contentView = hosting
        return panel
    }

    /// Centered on the notch, as large as the open island; the notch's size comes from the space either side of it.
    private func place(_ panel: NSPanel, on screen: NSScreen) {
        let frame = screen.frame
        let height = screen.safeAreaInsets.top
        let left = screen.auxiliaryTopLeftArea?.maxX ?? frame.width / 2 - 100
        let right = screen.auxiliaryTopRightArea?.minX ?? frame.width / 2 + 100
        state.notch = CGSize(width: right - left, height: height)
        let size = CGSize(width: max(right - left + 360, 600), height: height + 360)
        let center = frame.minX + (left + right) / 2
        panel.setFrame(
            CGRect(x: center - size.width / 2, y: frame.maxY - size.height, width: size.width, height: size.height),
            display: true)
    }
}

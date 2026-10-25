import AppKit
import Observation

/// The app's own settings, per machine. The notch view is on by default only where there is a notch.
@MainActor @Observable final class Preferences {
    static let shared = Preferences()

    static var hasNotch: Bool { NSScreen.screens.contains { $0.safeAreaInsets.top > 0 } }

    var server: URL? {
        didSet { UserDefaults.standard.set(server, forKey: "server") }
    }
    var notch: Bool {
        didSet { UserDefaults.standard.set(notch, forKey: "notch") }
    }
    var notchWhilePaused: Bool {
        didSet { UserDefaults.standard.set(notchWhilePaused, forKey: "notchWhilePaused") }
    }
    var menuBarItem: Bool {
        didSet { UserDefaults.standard.set(menuBarItem, forKey: "menuBarItem") }
    }

    private init() {
        let defaults = UserDefaults.standard
        server = defaults.url(forKey: "server")
        notch = defaults.object(forKey: "notch") as? Bool ?? Self.hasNotch
        notchWhilePaused = defaults.object(forKey: "notchWhilePaused") as? Bool ?? true
        menuBarItem = defaults.object(forKey: "menuBarItem") as? Bool ?? !Self.hasNotch
    }
}

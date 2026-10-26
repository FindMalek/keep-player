import AppKit

/// The music's levels from the page (bass → treble, 0–1), straight to the bars' layers: they never go through
/// SwiftUI, so 15 updates a second don't redraw anything else. The page only measures while something here shows bars.
@MainActor final class LevelMeter {
    static let shared = LevelMeter()

    private var listeners: [ObjectIdentifier: (([Double]) -> Void)] = [:]
    private var demand: Set<String> = []
    weak var bridge: PlayerBridge?

    func listen(_ owner: AnyObject, _ handler: @escaping ([Double]) -> Void) {
        listeners[ObjectIdentifier(owner)] = handler
    }

    func stop(_ owner: AnyObject) {
        listeners[ObjectIdentifier(owner)] = nil
    }

    #if DEBUG
    private var count = 0
    private var since = Date()
    private var loudest = [0.0, 0.0, 0.0, 0.0]
    #endif

    func push(_ levels: [Double]) {
        #if DEBUG
        count += 1
        loudest = zip(loudest, levels).map { max($0, $1) }
        if Date().timeIntervalSince(since) > 5 {
            print("levels: \(count) in 5 s, loudest \(loudest)")
            count = 0
            loudest = [0, 0, 0, 0]
            since = Date()
        }
        #endif
        for handler in listeners.values { handler(levels) }
    }

    /// After the page (re)loads its timer is off: ask again for what is wanted now.
    func resync() {
        bridge?.call("levels(\(!demand.isEmpty))")
    }

    /// `source` (the island, the mini player) shows bars or not; the page measures while any does.
    func want(_ source: String, _ on: Bool) {
        let before = !demand.isEmpty
        if on { demand.insert(source) } else { demand.remove(source) }
        let after = !demand.isEmpty
        if before != after { bridge?.call("levels(\(after))") }
    }
}

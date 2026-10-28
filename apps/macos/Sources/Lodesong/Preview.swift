import AppKit
import SwiftUI

/// `lodesong --preview <folder>`: draws the island in each state with a sample song to PNGs, then quits. For checking
/// the design (and README pictures) without a server, a login or screen recording.
@MainActor enum Preview {
    static var active = false

    static func render(to folder: URL) {
        active = true
        let nowPlaying = NowPlaying()
        nowPlaying.apply([
            "id": "preview", "title": "Teardrop", "artist": "Massive Attack", "album": "Mezzanine",
            "playing": true, "liked": true, "position": 94.0, "duration": 330.0,
            "at": Date().timeIntervalSince1970 * 1000,
        ])
        nowPlaying.cover = sampleCover()
        nowPlaying.queue = [
            QueueItem(uid: "1", title: "Inertia Creeps", artist: "Massive Attack", duration: 357),
            QueueItem(uid: "2", title: "Exchange", artist: "Massive Attack", duration: 251),
            QueueItem(uid: "3", title: "Dissolved Girl", artist: "Massive Attack", duration: 366),
        ]
        nowPlaying.lyricsSynced = true
        nowPlaying.lyrics = ["Love, love is a verb", "Love is a doing word", "Fearless on my breath", "Gentle impulsion"]
            .enumerated().map { LyricLine(start: Double($0.offset) * 30_000 + 60_000, text: $0.element, index: $0.offset) }
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let shots: [(String, IslandMode, IslandTab, CGFloat)] = [
            ("compact", .compact, .playing, 70), ("peek", .peek, .playing, 190), ("open", .open, .playing, 260),
            ("lyrics", .open, .lyrics, 350), ("queue", .open, .queue, 350),
        ]
        for (name, mode, tab, height) in shots {
            let state = IslandState()
            state.notch = CGSize(width: 220, height: 38)
            state.mode = mode
            state.tab = tab
            let view = IslandView(state: state, nowPlaying: nowPlaying, preferences: .shared) {}
                .frame(width: 640, height: height)
                .background(Color(white: 0.92))
            let renderer = ImageRenderer(content: view)
            renderer.scale = 2
            if let image = renderer.nsImage, let tiff = image.tiffRepresentation,
               let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) {
                try? png.write(to: folder.appendingPathComponent("\(name).png"))
            }
        }
    }

    /// What's New as someone coming from 1.2.0 to the latest would see it, from the real releases.
    static func renderWhatsNew(to folder: URL) async {
        guard let since = Version("1.2.0") else { return }
        let releases = await Updater.releases(limit: 50).filter { since < $0.version }
        let renderer = ImageRenderer(content: WhatsNewView(releases: releases, since: since) {}.background(.background))
        renderer.scale = 2
        if let image = renderer.nsImage, let tiff = image.tiffRepresentation,
           let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) {
            try? png.write(to: folder.appendingPathComponent("whats-new.png"))
        }
    }

    private static func sampleCover() -> NSImage {
        NSImage(size: CGSize(width: 256, height: 256), flipped: false) { rect in
            NSGradient(colors: [.systemIndigo, .black])?.draw(in: rect, angle: 60)
            return true
        }
    }
}

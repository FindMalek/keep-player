import AppKit
import ImageIO
import Observation

struct QueueItem: Identifiable, Equatable {
    let uid: String
    let title: String
    let artist: String
    let duration: Double
    var id: String { uid }
}

struct LyricLine: Identifiable, Equatable {
    /// Milliseconds into the song; nil for plain (unsynced) lyrics.
    let start: Double?
    let text: String
    let index: Int
    var id: Int { index }
}

/// What the web player's commands go through (the web view).
@MainActor protocol PlayerBridge: AnyObject {
    func call(_ js: String)
    func callAsync(_ js: String) async -> Any?
}

/// What's playing, as the web player reports it. Driven by its messages only: nothing here polls.
@MainActor @Observable final class NowPlaying {
    var id: String?
    var title: String?
    var artist = ""
    var album = ""
    var cover: NSImage?
    var playing = false
    var liked = false
    var duration: Double = 0
    var queue: [QueueItem] = []
    var lyrics: [LyricLine] = []
    var lyricsSynced = false

    /// The playhead as last reported and when: `position(at:)` moves it on without asking the page.
    private(set) var reported: Double = 0
    private(set) var reportedAt = Date()
    @ObservationIgnored private var coverKey = ""
    @ObservationIgnored weak var bridge: PlayerBridge?

    var hasSong: Bool { title != nil }

    func position(at date: Date) -> Double {
        guard playing else { return reported }
        return min(duration, reported + date.timeIntervalSince(reportedAt))
    }

    /// Every message carries the whole state; only what changed is written, since each write wakes the views reading it.
    func apply(_ message: [String: Any]) {
        let newID = message["id"] as? String
        if newID != id {
            id = newID
            lyrics = []
            lyricsSynced = false
            queue = []
        }
        set(\.title, message["title"] as? String)
        set(\.artist, message["artist"] as? String ?? "")
        set(\.album, message["album"] as? String ?? "")
        set(\.playing, message["playing"] as? Bool ?? false)
        set(\.liked, message["liked"] as? Bool ?? false)
        set(\.duration, message["duration"] as? Double ?? 0)
        reported = message["position"] as? Double ?? 0
        reportedAt = (message["at"] as? Double).map { Date(timeIntervalSince1970: $0 / 1000) } ?? Date()
        let data = message["cover"] as? String ?? ""
        if data.isEmpty {
            coverKey = ""
            set(\.cover, nil)
            return
        }
        // The same cover arrives with every message: decode it once per song, off the main thread, at the size shown.
        let key = "\(newID ?? "")|\(data.count)"
        guard key != coverKey else { return }
        coverKey = key
        Task.detached(priority: .userInitiated) {
            let image = Self.image(dataURL: data)
            await MainActor.run { if self.coverKey == key { self.cover = image } }
        }
    }

    private func set<Value: Equatable>(_ path: ReferenceWritableKeyPath<NowPlaying, Value>, _ value: Value) {
        if self[keyPath: path] != value { self[keyPath: path] = value }
    }

    /// Decoded straight to 128 px (the largest the island draws, at 2x): a small bitmap, not the full cover in memory.
    nonisolated private static func image(dataURL: String) -> NSImage? {
        guard let comma = dataURL.firstIndex(of: ","),
              let data = Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...])),
              let source = CGImageSourceCreateWithData(data as CFData, nil),
              let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                  kCGImageSourceCreateThumbnailFromImageAlways: true,
                  kCGImageSourceThumbnailMaxPixelSize: 128,
                  kCGImageSourceCreateThumbnailWithTransform: true,
              ] as CFDictionary)
        else { return nil }
        return NSImage(cgImage: thumbnail, size: CGSize(width: 64, height: 64))
    }

    // Commands, to the web player.
    func toggle() { bridge?.call("toggle()") }
    func next() { bridge?.call("next()") }
    func previous() { bridge?.call("previous()") }
    func like() {
        liked.toggle()
        bridge?.call("like()")
    }
    func seek(to seconds: Double) {
        reported = seconds
        reportedAt = Date()
        bridge?.call("seek(\(seconds))")
    }
    func jump(to item: QueueItem) {
        let uid = item.uid.replacingOccurrences(of: "\"", with: "")
        bridge?.call("jump(\"\(uid)\")")
    }

    func loadQueue() async {
        guard let rows = await bridge?.callAsync("queue()") as? [[String: Any]] else { return }
        queue = rows.map {
            QueueItem(
                uid: $0["uid"] as? String ?? UUID().uuidString,
                title: $0["title"] as? String ?? "",
                artist: $0["artist"] as? String ?? "",
                duration: $0["duration"] as? Double ?? 0)
        }
    }

    func loadLyrics() async {
        guard let result = await bridge?.callAsync("lyrics()") as? [String: Any],
              let lines = result["lines"] as? [[String: Any]]
        else { return }
        lyricsSynced = (result["status"] as? String) == "synced"
        lyrics = lines.enumerated().map { index, line in
            LyricLine(start: line["start"] as? Double, text: line["text"] as? String ?? "", index: index)
        }
    }
}

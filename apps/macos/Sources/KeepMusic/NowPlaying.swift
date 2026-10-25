import AppKit
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

    func apply(_ message: [String: Any]) {
        let newID = message["id"] as? String
        if newID != id {
            lyrics = []
            lyricsSynced = false
        }
        id = newID
        title = message["title"] as? String
        artist = message["artist"] as? String ?? ""
        album = message["album"] as? String ?? ""
        playing = message["playing"] as? Bool ?? false
        liked = message["liked"] as? Bool ?? false
        duration = message["duration"] as? Double ?? 0
        reported = message["position"] as? Double ?? 0
        if let at = message["at"] as? Double {
            reportedAt = Date(timeIntervalSince1970: at / 1000)
        } else {
            reportedAt = Date()
        }
        let data = message["cover"] as? String ?? ""
        // The same cover arrives with every message: decode it once per song.
        let key = "\(newID ?? "")|\(data.count)"
        if key != coverKey {
            coverKey = key
            cover = Self.image(dataURL: data)
        }
    }

    private static func image(dataURL: String) -> NSImage? {
        guard let comma = dataURL.firstIndex(of: ","),
              let data = Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...]))
        else { return nil }
        return NSImage(data: data)
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

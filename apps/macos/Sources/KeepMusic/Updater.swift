import AppKit
import Observation

/// A release on GitHub, as the updater and What's New read it.
struct Release: Identifiable {
    let version: Version
    let date: Date?
    let notes: [ReleaseSection]
    let download: URL?
    var id: String { version.description }
}

struct ReleaseSection: Identifiable {
    let title: String
    let items: [String]
    var id: String { title }
}

struct Version: Comparable, CustomStringConvertible {
    let parts: [Int]
    init?(_ text: String) {
        let parts = text.trimmingCharacters(in: CharacterSet(charactersIn: "v ")).split(separator: ".").map { Int($0) }
        guard parts.count == 3, parts.allSatisfy({ $0 != nil }) else { return nil }
        self.parts = parts.compactMap { $0 }
    }
    static func < (a: Version, b: Version) -> Bool { a.parts.lexicographicallyPrecedes(b.parts) }
    var description: String { parts.map(String.init).joined(separator: ".") }
    static var running: Version? { Version(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "") }
}

/// Updates over the air: GitHub's latest release is checked at launch and every few hours (scheduled by macOS for when
/// it costs the least energy); a newer one downloads in the background and waits for a restart to swap itself in.
@MainActor @Observable final class Updater {
    enum State: Equatable { case idle, checking, downloading, ready(String), failed(String) }

    static let repo = "FindMalek/keep-player"
    static let asset = "keep-music-macos.zip"

    var state: State = .idle
    var automatic: Bool {
        didSet { UserDefaults.standard.set(automatic, forKey: "autoUpdate") }
    }
    @ObservationIgnored private var staged: URL?
    @ObservationIgnored private var scheduler: NSBackgroundActivityScheduler?
    @ObservationIgnored var onReady: ((String) -> Void)?

    init() {
        automatic = UserDefaults.standard.object(forKey: "autoUpdate") as? Bool ?? true
    }

    func start() {
        Task {
            try? await Task.sleep(for: .seconds(15))
            await check(userInitiated: false)
        }
        let scheduler = NSBackgroundActivityScheduler(identifier: "engineer.findmalek.keep-music.update")
        scheduler.repeats = true
        scheduler.interval = 6 * 3600
        scheduler.tolerance = 1800
        scheduler.qualityOfService = .utility
        scheduler.schedule { [weak self] done in
            Task { @MainActor in
                await self?.check(userInitiated: false)
                done(.finished)
            }
        }
        self.scheduler = scheduler
    }

    /// Looks for a newer release and, if there is one (and updates are automatic or asked for), fetches it.
    func check(userInitiated: Bool) async {
        guard let running = Version.running, state != .downloading, !(state.isReady) else { return }
        guard automatic || userInitiated else { return }
        state = .checking
        guard let latest = await Self.releases(limit: 1).first else {
            state = userInitiated ? .failed("Couldn't reach GitHub.") : .idle
            return
        }
        guard running < latest.version, let download = latest.download else {
            state = .idle
            if userInitiated { Self.tell("You're up to date", "keep music \(running) is the newest version.") }
            return
        }
        state = .downloading
        do {
            staged = try await Self.stage(download, version: latest.version.description)
            state = .ready(latest.version.description)
            onReady?(latest.version.description)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    /// Swaps the new app in once this one has quit, then opens it.
    func restart() {
        guard let staged else { return }
        let current = Bundle.main.bundleURL.path
        let script = """
        while kill -0 \(ProcessInfo.processInfo.processIdentifier) 2>/dev/null; do sleep 0.2; done
        rm -rf "\(current)" && mv "\(staged.path)" "\(current)" && open "\(current)"
        """
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/sh")
        process.arguments = ["-c", script]
        try? process.run()
        NSApp.terminate(nil)
    }

    private static func stage(_ url: URL, version: String) async throws -> URL {
        let folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("engineer.findmalek.keep-music/update/\(version)")
        try? FileManager.default.removeItem(at: folder)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let (zip, _) = try await URLSession.shared.download(from: url)
        let unzip = Process()
        unzip.executableURL = URL(fileURLWithPath: "/usr/bin/ditto")
        unzip.arguments = ["-x", "-k", zip.path, folder.path]
        try unzip.run()
        unzip.waitUntilExit()
        let app = folder.appendingPathComponent("keep music.app")
        guard unzip.terminationStatus == 0,
              Bundle(url: app)?.bundleIdentifier == Bundle.main.bundleIdentifier
        else { throw CocoaError(.fileReadCorruptFile) }
        return app
    }

    /// The newest releases, newest first, with their notes split into sections.
    static func releases(limit: Int) async -> [Release] {
        var request = URLRequest(url: URL(string: "https://api.github.com/repos/\(repo)/releases?per_page=\(limit)")!)
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else { return [] }
        return rows.compactMap { row in
            guard row["draft"] as? Bool != true, row["prerelease"] as? Bool != true,
                  let version = Version(row["tag_name"] as? String ?? "")
            else { return nil }
            let assets = row["assets"] as? [[String: Any]] ?? []
            let download = assets.first { $0["name"] as? String == asset }?["browser_download_url"] as? String
            return Release(
                version: version,
                date: (row["published_at"] as? String).flatMap { ISO8601DateFormatter().date(from: $0) },
                notes: notes(row["body"] as? String ?? ""),
                download: download.flatMap(URL.init(string:)))
        }
        .sorted { $0.version > $1.version }
    }

    /// release-please's changelog: "### Features" / "### Bug Fixes" with "* **scope:** text ([#1](…)) ([abc](…))" lines.
    static func notes(_ body: String) -> [ReleaseSection] {
        var sections: [ReleaseSection] = []
        var title = ""
        var items: [String] = []
        func flush() {
            if !items.isEmpty { sections.append(ReleaseSection(title: title.isEmpty ? "Changes" : title, items: items)) }
            items = []
        }
        for line in body.split(separator: "\n").map(String.init) {
            if line.hasPrefix("### ") {
                flush()
                title = String(line.dropFirst(4)).replacingOccurrences(of: "Bug Fixes", with: "Fixes")
            } else if line.hasPrefix("* ") {
                var text = String(line.dropFirst(2))
                text = text.replacingOccurrences(of: #"\s*\(\[[^\]]*\]\([^)]*\)\)"#, with: "", options: .regularExpression)
                // "**artist:** appears on" → "Artist: appears on"
                text = text.replacingOccurrences(of: #"\*\*([^*]+):\*\*\s*"#, with: "$1: ", options: .regularExpression)
                items.append(text.prefix(1).uppercased() + text.dropFirst())
            }
        }
        flush()
        return sections
    }

    static func tell(_ title: String, _ text: String) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = text
        alert.runModal()
    }
}

extension Updater.State {
    var isReady: Bool { if case .ready = self { true } else { false } }
}

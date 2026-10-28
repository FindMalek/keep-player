import AppKit
import SwiftUI

/// After an update: everything shipped since the version you last opened, every release in between, newest first.
enum WhatsNew {
    private static let key = "lastSeenVersion"

    /// Shows the window when the running version is newer than the last one opened; the first launch only remembers it.
    @MainActor static func showIfUpdated() {
        guard let running = Version.running else { return }
        let seen = Version(UserDefaults.standard.string(forKey: key) ?? "")
        UserDefaults.standard.set(running.description, forKey: key)
        guard let seen, seen < running else { return }
        Task {
            let releases = await Updater.releases(limit: 50).filter { seen < $0.version && $0.version <= running }
            guard !releases.isEmpty else { return }
            open(releases, since: seen)
        }
    }

    private static var window: NSWindow?

    @MainActor static func open(_ releases: [Release], since: Version) {
        let window = NSWindow(
            contentRect: CGRect(x: 0, y: 0, width: 520, height: 560),
            styleMask: [.titled, .closable, .fullSizeContentView], backing: .buffered, defer: false)
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.isReleasedWhenClosed = false
        window.contentView = NSHostingView(rootView: WhatsNewView(releases: releases, since: since) { window.close() })
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        self.window = window
    }
}

struct WhatsNewView: View {
    let releases: [Release]
    let since: Version
    let close: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 6) {
                Image(nsImage: NSApp.applicationIconImage).resizable().frame(width: 72, height: 72)
                Text("What's New in lodesong").font(.system(size: 22, weight: .bold))
                Text(releases.count == 1 ? "Version \(releases[0].version.description)" : "Since \(since.description): \(releases.count) updates")
                    .font(.system(size: 13)).foregroundStyle(.secondary)
            }
            .padding(.top, 36)
            .padding(.bottom, 18)
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    ForEach(releases) { release in
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(alignment: .firstTextBaseline) {
                                Text(release.version.description).font(.system(size: 15, weight: .semibold))
                                if let date = release.date {
                                    Text(date.formatted(date: .abbreviated, time: .omitted))
                                        .font(.system(size: 12)).foregroundStyle(.secondary)
                                }
                            }
                            ForEach(release.notes) { section in
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(section.title.uppercased())
                                        .font(.system(size: 10, weight: .semibold)).foregroundStyle(.secondary)
                                    ForEach(section.items, id: \.self) { item in
                                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                                            Image(systemName: section.title == "Fixes" ? "wrench.and.screwdriver" : "sparkles")
                                                .font(.system(size: 10)).foregroundStyle(.secondary).frame(width: 14)
                                            Text(item).font(.system(size: 13)).fixedSize(horizontal: false, vertical: true)
                                        }
                                    }
                                }
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(.horizontal, 32)
                .padding(.bottom, 12)
            }
            Divider()
            HStack {
                Spacer()
                Button("Continue", action: close).keyboardShortcut(.defaultAction).controlSize(.large)
            }
            .padding(16)
        }
        .frame(width: 520, height: 560)
    }
}

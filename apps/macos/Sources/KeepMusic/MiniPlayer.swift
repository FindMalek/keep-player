import AppKit
import SwiftUI

/// A small always-on-top player for Macs without a notch (⌘⇧M), resizable from a strip to a square.
enum MiniPlayer {
    @MainActor static func panel(nowPlaying: NowPlaying) -> NSPanel {
        let panel = NSPanel(
            contentRect: CGRect(x: 0, y: 0, width: 400, height: 128),
            styleMask: [.titled, .closable, .resizable, .fullSizeContentView, .nonactivatingPanel, .utilityWindow],
            backing: .buffered, defer: false)
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.isMovableByWindowBackground = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.contentMinSize = CGSize(width: 260, height: 56)
        panel.contentMaxSize = CGSize(width: 720, height: 760)
        panel.contentView = NSHostingView(
            rootView: MiniView(nowPlaying: nowPlaying)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(.black)
                .environment(\.colorScheme, .dark))
        panel.setFrameAutosaveName("mini")
        if !panel.setFrameUsingName("mini") { panel.center() }
        return panel
    }
}

/// Under 96 pt tall: one row. Taller: song, playhead and buttons. From 260 pt (and wide enough): the cover on top.
struct MiniView: View {
    let nowPlaying: NowPlaying

    var body: some View {
        GeometryReader { geometry in
            let size = geometry.size
            Group {
                if size.height < 96 {
                    strip
                } else if size.height < 260 || size.width < 220 {
                    regular
                } else {
                    tall(cover: min(size.width - 32, size.height - 170))
                }
            }
            .padding(size.height < 96 ? 10 : 16)
            .frame(width: size.width, height: size.height)
        }
    }

    private var like: some View {
        IconButton(symbol: nowPlaying.liked ? "heart.fill" : "heart", size: 14, label: nowPlaying.liked ? "Unlike" : "Like") {
            nowPlaying.like()
        }
        .contentTransition(.symbolEffect(.replace))
    }

    private var strip: some View {
        HStack(spacing: 10) {
            Artwork(image: nowPlaying.cover, size: 36, radius: 8)
            Text(nowPlaying.title ?? "").font(.system(size: 13, weight: .semibold)).lineLimit(1)
            Spacer(minLength: 4)
            Transport(nowPlaying: nowPlaying, size: 13)
            like
        }
    }

    private var regular: some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                Artwork(image: nowPlaying.cover, size: 44, radius: 10)
                VStack(alignment: .leading, spacing: 1) {
                    Text(nowPlaying.title ?? "").font(.system(size: 14, weight: .semibold)).lineLimit(1)
                    Text(nowPlaying.artist).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 8)
                like
            }
            InlineProgress(nowPlaying: nowPlaying)
            Transport(nowPlaying: nowPlaying, size: 16)
        }
    }

    private func tall(cover: CGFloat) -> some View {
        VStack(spacing: 12) {
            Artwork(image: nowPlaying.cover, size: max(cover, 80), radius: 12)
            VStack(spacing: 2) {
                Text(nowPlaying.title ?? "").font(.system(size: 15, weight: .semibold)).lineLimit(1)
                Text(nowPlaying.artist).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
            }
            InlineProgress(nowPlaying: nowPlaying)
            HStack(spacing: 18) {
                Transport(nowPlaying: nowPlaying, size: 16)
                like
            }
        }
    }
}

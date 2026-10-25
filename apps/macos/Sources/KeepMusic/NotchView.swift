import SwiftUI

enum IslandMode { case compact, peek, open }
enum IslandTab: String, CaseIterable, Identifiable {
    case playing = "Now Playing", lyrics = "Lyrics", queue = "Queue", settings = "Settings"
    var id: String { rawValue }
    var symbol: String {
        switch self {
        case .playing: "play.circle"
        case .lyrics: "quote.bubble"
        case .queue: "list.bullet"
        case .settings: "gearshape"
        }
    }
}

/// The island's state, shared with the controller that owns its window.
@MainActor @Observable final class IslandState {
    var mode: IslandMode = .compact
    var tab: IslandTab = .playing
    /// The physical notch, in points.
    var notch = CGSize(width: 200, height: 32)
}

private let spring = Animation.spring(response: 0.42, dampingFraction: 0.82)

/// The black shape around the notch, growing from a sliver (cover left, sound bars right) to a peek on hover and a
/// full panel on click.
struct IslandView: View {
    @Bindable var state: IslandState
    let nowPlaying: NowPlaying
    let preferences: Preferences
    let openPlayer: () -> Void
    @State private var collapse: Task<Void, Never>?

    private var size: CGSize {
        let notch = state.notch
        switch state.mode {
        case .compact: return CGSize(width: notch.width + 2 * (notch.height + 10), height: notch.height)
        case .peek: return CGSize(width: max(notch.width + 200, 400), height: notch.height + 96)
        case .open: return CGSize(width: max(notch.width + 320, 540), height: notch.height + 290)
        }
    }

    private var radius: CGFloat {
        switch state.mode {
        case .compact: 10
        case .peek: 24
        case .open: 32
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .top) {
                IslandShape(radius: radius)
                    .fill(.black)
                content
                    .padding(.horizontal, state.mode == .compact ? 14 : 24)
            }
            .frame(width: size.width, height: size.height)
            .contentShape(IslandShape(radius: radius))
            .onHover(perform: hover)
            .onTapGesture {
                if state.mode != .open { withAnimation(spring) { state.mode = .open } }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .environment(\.colorScheme, .dark)
    }

    private func hover(_ inside: Bool) {
        collapse?.cancel()
        if inside {
            if state.mode == .compact { withAnimation(spring) { state.mode = .peek } }
            return
        }
        // A short grace period, so brushing past the edge doesn't snap it shut.
        collapse = Task {
            try? await Task.sleep(for: .milliseconds(state.mode == .open ? 450 : 150))
            guard !Task.isCancelled else { return }
            withAnimation(spring) { state.mode = .compact }
        }
    }

    @ViewBuilder private var content: some View {
        switch state.mode {
        case .compact:
            HStack {
                Artwork(image: nowPlaying.cover, size: state.notch.height - 12, radius: 5)
                Spacer(minLength: state.notch.width)
                SoundBars(playing: nowPlaying.playing)
                    .frame(width: 14, height: 12)
                    .padding(.trailing, 4)
            }
            .frame(height: state.notch.height)
            .transition(.opacity)
        case .peek:
            PeekView(nowPlaying: nowPlaying)
                .padding(.top, state.notch.height + 8)
                .transition(.opacity.combined(with: .scale(scale: 0.96, anchor: .top)))
        case .open:
            OpenView(state: state, nowPlaying: nowPlaying, preferences: preferences, openPlayer: openPlayer)
                .padding(.top, state.notch.height + 6)
                .transition(.opacity.combined(with: .scale(scale: 0.97, anchor: .top)))
        }
    }
}

struct Artwork: View {
    let image: NSImage?
    let size: CGFloat
    let radius: CGFloat

    var body: some View {
        Group {
            if let image {
                Image(nsImage: image).resizable().interpolation(.high).aspectRatio(contentMode: .fill)
            } else {
                ZStack {
                    Color.white.opacity(0.1)
                    Image(systemName: "music.note").foregroundStyle(.secondary).font(.system(size: size * 0.4))
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}

/// Hover: the cover, title and artist, where the song is, and the three buttons.
struct PeekView: View {
    let nowPlaying: NowPlaying

    var body: some View {
        HStack(spacing: 14) {
            Artwork(image: nowPlaying.cover, size: 62, radius: 12)
            VStack(alignment: .leading, spacing: 2) {
                Text(nowPlaying.title ?? "").font(.system(size: 14, weight: .semibold)).lineLimit(1)
                Text(nowPlaying.artist).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
                Progress(nowPlaying: nowPlaying, interactive: false).padding(.top, 6)
            }
            Transport(nowPlaying: nowPlaying, size: 15)
        }
    }
}

/// The playhead with both times. It moves only while visible (the timeline stops with the view).
struct Progress: View {
    let nowPlaying: NowPlaying
    var interactive: Bool
    @State private var dragging: Double?

    var body: some View {
        TimelineView(.periodic(from: .now, by: nowPlaying.playing ? 0.5 : 3600)) { context in
            let position = dragging ?? nowPlaying.position(at: context.date)
            let fraction = nowPlaying.duration > 0 ? min(1, position / nowPlaying.duration) : 0
            VStack(spacing: 3) {
                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        Capsule().fill(.white.opacity(0.18))
                        Capsule().fill(.white).frame(width: geometry.size.width * fraction)
                    }
                    .contentShape(Rectangle())
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { value in
                                guard interactive else { return }
                                dragging = max(0, min(1, value.location.x / geometry.size.width)) * nowPlaying.duration
                            }
                            .onEnded { _ in
                                if let dragging { nowPlaying.seek(to: dragging) }
                                dragging = nil
                            })
                }
                .frame(height: interactive ? 5 : 3)
                HStack {
                    Text(clock(position))
                    Spacer()
                    Text("-" + clock(max(0, nowPlaying.duration - position)))
                }
                .font(.system(size: 10, weight: .medium).monospacedDigit())
                .foregroundStyle(.secondary)
            }
        }
    }
}

func clock(_ seconds: Double) -> String {
    let total = Int(seconds.rounded(.down))
    return String(format: "%d:%02d", total / 60, total % 60)
}

struct Transport: View {
    let nowPlaying: NowPlaying
    var size: CGFloat

    var body: some View {
        HStack(spacing: size * 1.1) {
            IconButton(symbol: "backward.fill", size: size, label: "Previous") { nowPlaying.previous() }
            IconButton(symbol: nowPlaying.playing ? "pause.fill" : "play.fill", size: size * 1.35, label: nowPlaying.playing ? "Pause" : "Play") {
                nowPlaying.toggle()
            }
            .contentTransition(.symbolEffect(.replace))
            IconButton(symbol: "forward.fill", size: size, label: "Next") { nowPlaying.next() }
        }
    }
}

struct IconButton: View {
    let symbol: String
    var size: CGFloat = 15
    var label: String
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: size, weight: .semibold))
                .frame(width: size * 1.9, height: size * 1.9)
                .background(Circle().fill(.white.opacity(hovering ? 0.12 : 0)))
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .help(label)
        .accessibilityLabel(label)
    }
}

/// Click: the song on top, then Now Playing, Lyrics, Queue and Settings.
struct OpenView: View {
    @Bindable var state: IslandState
    let nowPlaying: NowPlaying
    let preferences: Preferences
    let openPlayer: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                Artwork(image: nowPlaying.cover, size: 48, radius: 10)
                VStack(alignment: .leading, spacing: 1) {
                    Text(nowPlaying.title ?? "Nothing playing").font(.system(size: 14, weight: .semibold)).lineLimit(1)
                    Text([nowPlaying.artist, nowPlaying.album].filter { !$0.isEmpty }.joined(separator: " — "))
                        .font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer()
                IconButton(symbol: nowPlaying.liked ? "heart.fill" : "heart", size: 14, label: nowPlaying.liked ? "Unlike" : "Like") {
                    nowPlaying.like()
                }
                .contentTransition(.symbolEffect(.replace))
                SoundBars(playing: nowPlaying.playing).frame(width: 14, height: 12)
            }
            TabBar(tab: $state.tab)
            Group {
                switch state.tab {
                case .playing: NowPlayingTab(nowPlaying: nowPlaying, openPlayer: openPlayer)
                case .lyrics: LyricsTab(nowPlaying: nowPlaying)
                case .queue: QueueTab(nowPlaying: nowPlaying)
                case .settings: SettingsTab(preferences: preferences, openPlayer: openPlayer)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
        .padding(.bottom, 16)
    }
}

struct TabBar: View {
    @Binding var tab: IslandTab
    @Namespace private var selection

    var body: some View {
        HStack(spacing: 2) {
            ForEach(IslandTab.allCases) { item in
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { tab = item }
                } label: {
                    Label(item.rawValue, systemImage: item.symbol)
                        .font(.system(size: 11, weight: .medium))
                        .labelStyle(.titleAndIcon)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .foregroundStyle(tab == item ? .primary : .secondary)
                        .background {
                            if tab == item {
                                Capsule().fill(.white.opacity(0.14)).matchedGeometryEffect(id: "tab", in: selection)
                            }
                        }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(Capsule().fill(.white.opacity(0.06)))
    }
}

struct NowPlayingTab: View {
    let nowPlaying: NowPlaying
    let openPlayer: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            Progress(nowPlaying: nowPlaying, interactive: true).padding(.top, 14)
            Transport(nowPlaying: nowPlaying, size: 20)
            Button("Open keep music", action: openPlayer)
                .buttonStyle(.plain)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.secondary)
        }
    }
}

struct LyricsTab: View {
    let nowPlaying: NowPlaying

    var body: some View {
        Group {
            if nowPlaying.lyrics.isEmpty {
                Placeholder(symbol: "quote.bubble", text: "No lyrics for this song")
            } else {
                TimelineView(.periodic(from: .now, by: nowPlaying.playing && nowPlaying.lyricsSynced ? 0.3 : 3600)) { context in
                    let now = nowPlaying.position(at: context.date) * 1000
                    let current = nowPlaying.lyricsSynced
                        ? nowPlaying.lyrics.last(where: { ($0.start ?? .infinity) <= now })?.index : nil
                    ScrollViewReader { reader in
                        ScrollView(showsIndicators: false) {
                            VStack(alignment: .leading, spacing: 8) {
                                ForEach(nowPlaying.lyrics) { line in
                                    Text(line.text.isEmpty ? "♪" : line.text)
                                        .font(.system(size: 15, weight: line.index == current ? .bold : .semibold))
                                        .foregroundStyle(line.index == current ? .primary : .secondary)
                                        .opacity(current == nil || line.index == current ? 1 : 0.55)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .id(line.index)
                                        .onTapGesture {
                                            if let start = line.start { nowPlaying.seek(to: start / 1000) }
                                        }
                                }
                            }
                            .padding(.vertical, 8)
                        }
                        .onChange(of: current) { _, line in
                            guard let line else { return }
                            withAnimation(.easeInOut(duration: 0.35)) { reader.scrollTo(line, anchor: .center) }
                        }
                    }
                }
            }
        }
        .task(id: nowPlaying.id) { await nowPlaying.loadLyrics() }
    }
}

struct QueueTab: View {
    let nowPlaying: NowPlaying

    var body: some View {
        Group {
            if nowPlaying.queue.isEmpty {
                Placeholder(symbol: "list.bullet", text: "Nothing up next")
            } else {
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 2) {
                        ForEach(nowPlaying.queue) { item in
                            QueueRow(item: item) { nowPlaying.jump(to: item) }
                        }
                    }
                }
            }
        }
        .task(id: nowPlaying.id) { await nowPlaying.loadQueue() }
    }
}

struct QueueRow: View {
    let item: QueueItem
    let play: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: play) {
            HStack {
                VStack(alignment: .leading, spacing: 1) {
                    Text(item.title).font(.system(size: 12, weight: .medium)).lineLimit(1)
                    Text(item.artist).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer()
                Text(clock(item.duration)).font(.system(size: 11).monospacedDigit()).foregroundStyle(.secondary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(.white.opacity(hovering ? 0.08 : 0)))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
    }
}

struct SettingsTab: View {
    @Bindable var preferences: Preferences
    let openPlayer: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(spacing: 0) {
                SettingRow(title: "Show in the notch", detail: "The song beside the notch while it plays", isOn: $preferences.notch)
                Divider().overlay(.white.opacity(0.08)).padding(.leading, 12)
                SettingRow(title: "Keep showing while paused", detail: nil, isOn: $preferences.notchWhilePaused)
                Divider().overlay(.white.opacity(0.08)).padding(.leading, 12)
                SettingRow(title: "Menu bar item", detail: nil, isOn: $preferences.menuBarItem)
            }
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(.white.opacity(0.06)))
            HStack(spacing: 8) {
                Button("Open keep music", action: openPlayer)
                Button("Change Server…") { NSApp.sendAction(#selector(AppDelegate.changeServer), to: nil, from: nil) }
            }
            .controlSize(.small)
        }
        .padding(.top, 10)
    }
}

/// A System Settings row: the title (and a line under it) on the left, the switch on the right.
struct SettingRow: View {
    let title: String
    let detail: String?
    @Binding var isOn: Bool

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.system(size: 12))
                if let detail { Text(detail).font(.system(size: 11)).foregroundStyle(.secondary) }
            }
            Spacer()
            Toggle(title, isOn: $isOn).labelsHidden().toggleStyle(.switch).controlSize(.mini)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }
}

struct Placeholder: View {
    let symbol: String
    let text: String

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: symbol).font(.system(size: 22)).foregroundStyle(.tertiary)
            Text(text).font(.system(size: 12)).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

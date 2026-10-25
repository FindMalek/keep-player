import AppKit
import SwiftUI

/// A small always-on-top player for Macs without a notch (⌘⇧M): the island's hover view in a floating window.
enum MiniPlayer {
    @MainActor static func panel(nowPlaying: NowPlaying) -> NSPanel {
        let panel = NSPanel(
            contentRect: CGRect(x: 0, y: 0, width: 400, height: 96),
            styleMask: [.titled, .closable, .fullSizeContentView, .nonactivatingPanel, .utilityWindow],
            backing: .buffered, defer: false)
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.isMovableByWindowBackground = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.contentView = NSHostingView(
            rootView: PeekView(nowPlaying: nowPlaying)
                .padding(16)
                .frame(width: 400, height: 96)
                .background(.black)
                .environment(\.colorScheme, .dark))
        panel.setFrameAutosaveName("mini")
        if !panel.setFrameUsingName("mini") { panel.center() }
        return panel
    }
}

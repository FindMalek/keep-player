import AppKit
import SwiftUI

/// ⌘, : the app's own settings, laid out like System Settings.
@MainActor enum SettingsWindow {
    private static var window: NSWindow?

    static func show(preferences: Preferences, updater: Updater) {
        if window == nil {
            let window = NSWindow(
                contentRect: CGRect(x: 0, y: 0, width: 460, height: 420),
                styleMask: [.titled, .closable], backing: .buffered, defer: false)
            window.title = "Settings"
            window.isReleasedWhenClosed = false
            window.contentView = NSHostingView(rootView: SettingsView(preferences: preferences, updater: updater))
            window.center()
            self.window = window
        }
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
    }
}

struct SettingsView: View {
    @Bindable var preferences: Preferences
    @Bindable var updater: Updater

    var body: some View {
        Form {
            Section("Island") {
                Toggle("Show the song around the notch", isOn: $preferences.notch)
                    .disabled(!Preferences.hasNotch)
                Toggle("Keep showing while paused (5 min)", isOn: $preferences.notchWhilePaused)
                    .disabled(!preferences.notch || !Preferences.hasNotch)
                if !Preferences.hasNotch {
                    Text("This Mac has no notch: use the mini player (⇧⌘M) or the menu bar item.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            Section("Menu Bar") {
                Toggle("Show keep music in the menu bar", isOn: $preferences.menuBarItem)
            }
            Section("Updates") {
                Toggle("Download updates automatically", isOn: $updater.automatic)
                LabeledContent("Version \(Version.running?.description ?? "dev")") {
                    switch updater.state {
                    case .checking: ProgressView().controlSize(.small)
                    case .downloading: Text("Downloading…").foregroundStyle(.secondary)
                    case let .ready(version): Button("Restart to Update to \(version)") { updater.restart() }
                    default: Button("Check Now") { Task { await updater.check(userInitiated: true) } }
                    }
                }
            }
            Section("Server") {
                LabeledContent("Address", value: preferences.server?.absoluteString ?? "not set")
                Button("Change Server…") { NSApp.sendAction(#selector(AppDelegate.changeServer), to: nil, from: nil) }
            }
        }
        .formStyle(.grouped)
        .frame(width: 460, height: 420)
    }
}

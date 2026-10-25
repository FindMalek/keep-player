import AppKit

MainActor.assumeIsolated {
    if let flag = CommandLine.arguments.firstIndex(of: "--preview"), CommandLine.arguments.count > flag + 1 {
        Preview.render(to: URL(fileURLWithPath: CommandLine.arguments[flag + 1]))
        exit(0)
    }
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    app.setActivationPolicy(.regular)
    app.run()
}

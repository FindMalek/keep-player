import AppKit

#if DEBUG
setvbuf(stdout, nil, _IONBF, 0)
_ = PlayerView.startUptime
#endif

MainActor.assumeIsolated {
    if let flag = CommandLine.arguments.firstIndex(of: "--preview"), CommandLine.arguments.count > flag + 1 {
        let folder = URL(fileURLWithPath: CommandLine.arguments[flag + 1])
        Preview.render(to: folder)
        Task {
            await Preview.renderWhatsNew(to: folder)
            exit(0)
        }
        RunLoop.main.run()
    }
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    app.setActivationPolicy(.regular)
    app.run()
}

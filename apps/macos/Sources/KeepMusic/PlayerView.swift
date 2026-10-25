import AppKit
import WebKit

/// keep music in a web view: your session cookie is kept between launches, links to elsewhere open in the browser,
/// and the page's bridge (`window.keepNative`, `webkit.messageHandlers.keep`) feeds `NowPlaying`.
@MainActor final class PlayerView: NSObject, PlayerBridge, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    let webView: WKWebView
    private let server: URL
    private let nowPlaying: NowPlaying

    init(server: URL, nowPlaying: NowPlaying) {
        self.server = server
        self.nowPlaying = nowPlaying
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.mediaTypesRequiringUserActionForPlayback = []
        // The player names this device "the desktop app" in its device picker.
        config.applicationNameForUserAgent = "keep-music-desktop"
        let controller = WKUserContentController()
        config.userContentController = controller
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        controller.add(WeakHandler(self), name: "keep")
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        nowPlaying.bridge = self
        webView.load(URLRequest(url: server))
    }

    nonisolated func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        // WebKit calls this on the main thread.
        MainActor.assumeIsolated {
            if let body = message.body as? [String: Any] { nowPlaying.apply(body) }
        }
    }

    func call(_ js: String) {
        webView.evaluateJavaScript("window.keepNative && window.keepNative.\(js)")
    }

    func callAsync(_ js: String) async -> Any? {
        try? await webView.callAsyncJavaScript(
            "return window.keepNative ? await window.keepNative.\(js) : null", contentWorld: .page)
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
        if action.navigationType == .linkActivated, let url = action.request.url, url.host != server.host {
            NSWorkspace.shared.open(url)
            return .cancel
        }
        return .allow
    }

    /// `target=_blank` and `window.open`: the browser.
    func webView(
        _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
        for action: WKNavigationAction, windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = action.request.url { NSWorkspace.shared.open(url) }
        return nil
    }
}

/// WKUserContentController keeps its handlers strongly; this keeps the player view from never being freed.
private final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}

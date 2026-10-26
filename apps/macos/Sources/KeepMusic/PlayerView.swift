import AppKit
import WebKit

/// keep music in a web view: your session cookie is kept between launches, links to elsewhere open in the browser,
/// and the page's bridge (`window.keepNative`, `webkit.messageHandlers.keep`) feeds `NowPlaying`.
@MainActor final class PlayerView: NSObject, PlayerBridge, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    let webView: WKWebView
    private let server: URL
    private let nowPlaying: NowPlaying
    /// Four taps on the signed-out page's background: the app's preview menu.
    var onPreview: (() -> Void)?
    /// Set by the page's first message after each load: the bridge exists from then on.
    private var pageReady = false
    #if DEBUG
    static let startUptime = ProcessInfo.processInfo.systemUptime
    #endif

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
        Self.allowFullFrameRate(config.preferences)
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        controller.add(WeakHandler(self), name: "keep")
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        // Until the page paints, the window's own background shows (dark in dark mode) instead of a white flash.
        webView.setValue(false, forKey: "drawsBackground")
        nowPlaying.bridge = self
        LevelMeter.shared.bridge = self
        webView.load(URLRequest(url: server))
    }

    /// WebKit renders pages near 60 fps even on a 120 Hz ProMotion screen: Safari's "Prefer Page Rendering Updates near
    /// 60fps" flag, on by default and private in WKWebView. Off here so scrolling and the lyrics move at the screen's rate.
    /// Every step is checked: a WebKit without the flag just keeps 60 fps.
    private static func allowFullFrameRate(_ preferences: WKPreferences) {
        let list = NSSelectorFromString("_features"), set = NSSelectorFromString("_setEnabled:forFeature:")
        let type: AnyObject = WKPreferences.self
        guard type.responds(to: list), preferences.responds(to: set),
              let features = type.perform(list)?.takeUnretainedValue() as? [NSObject],
              // `value(forKey:)` on a missing key raises an exception Swift can't catch, so ask first.
              let feature = features.first(where: {
                  $0.responds(to: NSSelectorFromString("key"))
                      && $0.value(forKey: "key") as? String == "PreferPageRenderingUpdatesNear60FPSEnabled"
              })
        else { return }
        typealias SetEnabled = @convention(c) (AnyObject, Selector, Bool, AnyObject) -> Void
        unsafeBitCast(preferences.method(for: set), to: SetEnabled.self)(preferences, set, false, feature)
    }

    nonisolated func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        // WebKit calls this on the main thread.
        MainActor.assumeIsolated {
            guard let body = message.body as? [String: Any] else { return }
            #if DEBUG
            if let debug = body["debug"] as? String { print("page:", debug); return }
            if body["levels"] == nil { print("now playing:", body["title"] ?? "nil", "playing:", body["playing"] ?? "nil") }
            #endif
            if body["preview"] != nil { onPreview?(); return }
            if !pageReady {
                pageReady = true
                #if DEBUG
                print("ready: \(Int((ProcessInfo.processInfo.systemUptime - Self.startUptime) * 1000)) ms after launch")
                #endif
                LevelMeter.shared.resync()
            }
            if let levels = body["levels"] as? [Double] {
                LevelMeter.shared.push(levels)
            } else {
                nowPlaying.apply(body)
            }
        }
    }

    func call(_ js: String) {
        webView.evaluateJavaScript("window.keepNative && window.keepNative.\(js)")
    }

    func callAsync(_ js: String) async -> Any? {
        try? await webView.callAsyncJavaScript(
            "return window.keepNative ? await window.keepNative.\(js) : null", contentWorld: .page)
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        pageReady = false
    }

    #if DEBUG
    /// Debug builds only: `KEEP_TEST_LOGIN=user:password` signs in and starts an album, for hands-free performance runs.
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let login = ProcessInfo.processInfo.environment["KEEP_TEST_LOGIN"], let colon = login.firstIndex(of: ":") else { return }
        let user = String(login[..<colon]), password = String(login[login.index(after: colon)...])
        let script = """
        (async () => {
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));
          const say = (text) => webkit.messageHandlers.keep.postMessage({ debug: text });
          const field = (label) => document.querySelector(`input[aria-label="${label}"], #${label}`) ?? [...document.querySelectorAll("label")].find((l) => l.textContent.trim() === label)?.control;
          const fill = (el, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); };
          for (let i = 0; i < 50 && !field("username") && !document.querySelector('a[href="/albums"]'); i++) await wait(100);
          if (field("username")) {
            fill(field("username"), \(String(reflecting: user))); fill(field("password"), \(String(reflecting: password)));
            [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "sign in")?.click();
            for (let i = 0; i < 50 && !document.querySelector('a[href="/albums"]'); i++) await wait(100);
            say("signed in: " + !!document.querySelector('a[href="/albums"]'));
          }
          history.pushState({}, "", "/album/al-3"); dispatchEvent(new Event("keep:navigate"));
          for (let i = 0; i < 50 && ![...document.querySelectorAll("button")].some((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim() === "play"); i++) await wait(100);
          const play = [...document.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim() === "play");
          say("play button: " + !!play + " at " + location.pathname);
          play?.click();
          if (!\(ProcessInfo.processInfo.environment["KEEP_TEST_SCROLL"] != nil)) return;
          // KEEP_TEST_SCROLL: frame times while the content scrolls, with the island and its levels running.
          await wait(3000);
          for (const path of ["/songs", "/albums", "/"]) {
            history.pushState({}, "", path); dispatchEvent(new Event("keep:navigate"));
            await wait(2000);
            const scroller = document.getElementById("content");
            const frames = [];
            await new Promise((done) => {
              let last = performance.now();
              // Down, and back up at the end: a frame where nothing scrolls would flatter the numbers.
              let direction = 40;
              const step = (t) => {
                frames.push(t - last); last = t;
                const before = scroller.scrollTop;
                scroller.scrollBy(0, direction);
                if (scroller.scrollTop === before) { direction = -direction; scroller.scrollBy(0, direction); }
                frames.length < 180 ? requestAnimationFrame(step) : done();
              };
              requestAnimationFrame(step);
            });
            const sorted = frames.slice(2).sort((a, b) => a - b);
            const at = (q) => sorted[Math.floor(sorted.length * q)].toFixed(1);
            say(`scroll ${path}: p50 ${at(0.5)} p95 ${at(0.95)} max ${sorted.at(-1).toFixed(0)} janky ${sorted.filter((f) => f > 33).length}/${sorted.length}`);
          }
        })().catch((e) => say("error: " + e));
        """
        webView.evaluateJavaScript(script)
    }
    #endif

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

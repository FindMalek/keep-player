import AppKit
import SwiftUI

/// The playing indicator, like the iPhone's: four bars bouncing out of step. Core Animation runs it in the render
/// server at a capped frame rate, so the app itself stays asleep; paused, the bars rest low and nothing animates.
struct SoundBars: View {
    var playing: Bool

    var body: some View {
        if Preview.active {
            // ImageRenderer can't draw AppKit views: still bars for the preview pictures.
            HStack(alignment: .bottom, spacing: 1.6) {
                ForEach([0.5, 1, 0.7, 0.85], id: \.self) { height in
                    Capsule().fill(.white).frame(height: 12 * (playing ? height : 0.28))
                }
            }
        } else {
            BarsRepresentable(playing: playing)
        }
    }
}

private struct BarsRepresentable: NSViewRepresentable {
    var playing: Bool
    func makeNSView(context: Context) -> BarsView { BarsView(color: .white) }
    func updateNSView(_ view: BarsView, context: Context) { view.setPlaying(playing) }
}

/// Four bars. With levels from the page they follow the music (each eases to its band in 80 ms); without (before the
/// first levels arrive, or the page can't measure) they fall back to a gentle loop. Paused, they rest low.
final class BarsView: NSView {
    private var bars: [CALayer] = []
    private var playing = false
    private var live = false
    private var fallback: DispatchWorkItem?
    private let durations: [CFTimeInterval] = [0.42, 0.55, 0.37, 0.49]
    private static let rest: CGFloat = 0.22

    init(color: NSColor) {
        super.init(frame: .zero)
        wantsLayer = true
        for _ in 0..<4 {
            let bar = CALayer()
            bar.backgroundColor = color.cgColor
            bar.anchorPoint = CGPoint(x: 0.5, y: 0)
            layer?.addSublayer(bar)
            bars.append(bar)
        }
    }

    required init?(coder: NSCoder) { nil }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if window == nil {
            MainActor.assumeIsolated { LevelMeter.shared.stop(self) }
        } else {
            MainActor.assumeIsolated { LevelMeter.shared.listen(self) { [weak self] levels in self?.show(levels) } }
        }
    }

    override func layout() {
        super.layout()
        let gap: CGFloat = 1.6
        let width = (bounds.width - gap * 3) / 4
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for (index, bar) in bars.enumerated() {
            bar.cornerRadius = width / 2
            bar.bounds = CGRect(x: 0, y: 0, width: width, height: bounds.height)
            bar.position = CGPoint(x: CGFloat(index) * (width + gap) + width / 2, y: 0)
        }
        CATransaction.commit()
        apply()
    }

    func setPlaying(_ value: Bool) {
        guard value != playing else { return }
        playing = value
        live = false
        apply()
    }

    private func show(_ levels: [Double]) {
        guard playing, levels.count == bars.count else { return }
        if !live {
            live = true
            bars.forEach { $0.removeAnimation(forKey: "loop") }
        }
        CATransaction.begin()
        CATransaction.setAnimationDuration(0.08)
        CATransaction.setAnimationTimingFunction(CAMediaTimingFunction(name: .linear))
        for (bar, level) in zip(bars, levels) {
            // A softer curve, so quiet passages still move and loud ones don't all pin to the top.
            let scale = Self.rest + (1 - Self.rest) * CGFloat(pow(min(1, max(0, level)), 0.75))
            bar.transform = CATransform3DMakeScale(1, scale, 1)
        }
        CATransaction.commit()
        // Levels stopped (the page went quiet or can't measure): back to the loop.
        fallback?.cancel()
        let item = DispatchWorkItem { [weak self] in
            guard let self, self.playing else { return }
            self.live = false
            self.apply()
        }
        fallback = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6, execute: item)
    }

    private func apply() {
        guard !live else { return }
        for (index, bar) in bars.enumerated() {
            bar.removeAllAnimations()
            bar.transform = CATransform3DMakeScale(1, playing ? 1 : Self.rest, 1)
            guard playing else { continue }
            let bounce = CABasicAnimation(keyPath: "transform.scale.y")
            bounce.fromValue = Self.rest
            bounce.toValue = 1
            bounce.duration = durations[index]
            bounce.autoreverses = true
            bounce.repeatCount = .infinity
            bounce.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            bounce.timeOffset = Double(index) * 0.13
            // No need for 120 Hz to show bouncing bars: fewer frames, less battery.
            bounce.preferredFrameRateRange = CAFrameRateRange(minimum: 15, maximum: 30, preferred: 24)
            bar.add(bounce, forKey: "loop")
        }
    }
}

/// The island: flush with the top of the screen, bottom corners rounded, and a small flare where it meets the
/// menu bar, so it reads as the notch growing.
struct IslandShape: Shape {
    var radius: CGFloat
    var flare: CGFloat = 6

    var animatableData: CGFloat {
        get { radius }
        set { radius = newValue }
    }

    func path(in rect: CGRect) -> Path {
        let w = rect.width, h = rect.height, f = flare
        let r = min(radius, (w - 2 * f) / 2, h - f)
        var path = Path()
        path.move(to: CGPoint(x: 0, y: 0))
        path.addQuadCurve(to: CGPoint(x: f, y: f), control: CGPoint(x: f, y: 0))
        path.addLine(to: CGPoint(x: f, y: h - r))
        path.addQuadCurve(to: CGPoint(x: f + r, y: h), control: CGPoint(x: f, y: h))
        path.addLine(to: CGPoint(x: w - f - r, y: h))
        path.addQuadCurve(to: CGPoint(x: w - f, y: h - r), control: CGPoint(x: w - f, y: h))
        path.addLine(to: CGPoint(x: w - f, y: f))
        path.addQuadCurve(to: CGPoint(x: w, y: 0), control: CGPoint(x: w - f, y: 0))
        path.closeSubpath()
        return path
    }
}

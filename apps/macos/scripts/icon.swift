import AppKit

// Draws the app icon (1024 px) to the path given: the brand's dark tile with the light split-square mark, on Apple's
// macOS icon grid (an 824 px rounded square with room for its shadow). `build.sh` turns it into AppIcon.icns.
let size: CGFloat = 1024
let image = NSImage(size: CGSize(width: size, height: size), flipped: false) { _ in
    let box = CGRect(x: 100, y: 100, width: 824, height: 824)
    let shape = NSBezierPath(roundedRect: box, xRadius: 185, yRadius: 185)

    NSGraphicsContext.saveGraphicsState()
    let shadow = NSShadow()
    shadow.shadowColor = NSColor.black.withAlphaComponent(0.35)
    shadow.shadowBlurRadius = 28
    shadow.shadowOffset = CGSize(width: 0, height: -12)
    shadow.set()
    NSColor.black.setFill()
    shape.fill()
    NSGraphicsContext.restoreGraphicsState()

    NSGradient(colors: [NSColor(white: 0.17, alpha: 1), NSColor(white: 0.03, alpha: 1)])?.draw(in: shape, angle: -90)

    // A hairline of light along the top edge, like glass catching it.
    NSGraphicsContext.saveGraphicsState()
    shape.addClip()
    let rim = NSBezierPath(roundedRect: box.insetBy(dx: 2, dy: 2), xRadius: 183, yRadius: 183)
    rim.lineWidth = 4
    NSGradient(colors: [NSColor(white: 1, alpha: 0.22), NSColor(white: 1, alpha: 0)])?.draw(in: rim, angle: -90)
    NSColor(white: 1, alpha: 0.12).setStroke()
    rim.stroke()
    NSGraphicsContext.restoreGraphicsState()

    // The mark (the favicon's two pieces on 16 units): a square split by a stepped vein, centered on the tile.
    let unit = 824.0 / 16 * 0.62
    func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: 512 + (x - 8) * unit, y: 512 + (8 - y) * unit) }
    func piece(_ points: [(CGFloat, CGFloat)]) -> NSBezierPath {
        let path = NSBezierPath()
        path.move(to: point(points[0].0, points[0].1))
        for (x, y) in points.dropFirst() { path.line(to: point(x, y)) }
        path.close()
        return path
    }
    NSColor(white: 0.96, alpha: 1).setFill()
    piece([(2, 2), (14, 2), (14, 6), (7.25, 6), (7.25, 8.5), (2, 8.5)]).fill()
    piece([(2, 10), (8.75, 10), (8.75, 7.5), (14, 7.5), (14, 14), (2, 14)]).fill()
    return true
}
let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size), bitsPerSample: 8, samplesPerPixel: 4,
    hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
image.draw(in: CGRect(x: 0, y: 0, width: size, height: size))
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))

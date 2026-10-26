import AppKit

// Draws the app icon (1024 px) to the path given: the brand's dark square with the light play triangle, on Apple's
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

    // The play triangle (the favicon's M5 3.5v9l7-4.5z on 16 units), centered on its own weight.
    let unit = 824.0 / 16 * 0.62
    let origin = CGPoint(x: 512 - 8.5 * unit + 0.4 * unit, y: 512 - 8 * unit)
    let triangle = NSBezierPath()
    triangle.move(to: CGPoint(x: origin.x + 5 * unit, y: origin.y + (16 - 3.5) * unit))
    triangle.line(to: CGPoint(x: origin.x + 5 * unit, y: origin.y + (16 - 12.5) * unit))
    triangle.line(to: CGPoint(x: origin.x + 12 * unit, y: origin.y + 8 * unit))
    triangle.close()
    triangle.lineJoinStyle = .round
    triangle.lineWidth = unit * 0.9
    NSColor(white: 0.96, alpha: 1).setFill()
    NSColor(white: 0.96, alpha: 1).setStroke()
    triangle.fill()
    triangle.stroke()
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

// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "KeepMusic",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(name: "KeepMusic", path: "Sources/KeepMusic")
    ]
)

// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "Lodesong",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(name: "Lodesong", path: "Sources/Lodesong")
    ]
)

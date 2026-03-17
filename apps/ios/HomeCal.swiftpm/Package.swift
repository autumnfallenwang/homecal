// swift-tools-version: 6.0

import AppleProductTypes
import PackageDescription

let package = Package(
    name: "HomeCal",
    platforms: [
        .iOS("18.0")
    ],
    products: [
        .iOSApplication(
            name: "HomeCal",
            targets: ["AppModule"],
            bundleIdentifier: "com.homecal.app",
            teamIdentifier: "",
            displayVersion: "1.0",
            bundleVersion: "1",
            appIcon: .placeholder(icon: .calendar),
            accentColor: .presetColor(.blue),
            supportedDeviceFamilies: [.phone, .pad],
            supportedInterfaceOrientations: [
                .portrait,
                .landscapeRight,
                .landscapeLeft,
                .portraitUpsideDown(.when(deviceFamilies: [.pad]))
            ]
        )
    ],
    targets: [
        .executableTarget(
            name: "AppModule",
            path: ".",
            exclude: ["Tests"]
        ),
        .testTarget(
            name: "HomeCalTests",
            dependencies: ["AppModule"],
            path: "Tests"
        )
    ]
)

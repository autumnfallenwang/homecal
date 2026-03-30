import HomeCalKit
import SwiftUI
import UIKit

class AppDelegate: NSObject, UIApplicationDelegate {
    var authManager: AuthManager?

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        guard let apiClient = authManager?.apiClient else { return }
        Task {
            do {
                try await apiClient.registerDevice(RegisterDeviceInput(token: token))
                print("Device token registered: \(token.prefix(8))...")
            } catch {
                print("Device token registration failed: \(error)")
            }
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("Push registration failed: \(error.localizedDescription)")
    }
}

@main
struct HomeCalApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @State private var authManager = AuthManager()

    var body: some Scene {
        WindowGroup {
            Group {
                if authManager.isLoading {
                    ProgressView("Loading...")
                } else if authManager.isAuthenticated {
                    HomeView()
                } else {
                    LoginView()
                }
            }
            .environment(authManager)
            .onChange(of: authManager.isAuthenticated) {
                appDelegate.authManager = authManager
            }
            .onAppear {
                appDelegate.authManager = authManager
            }
        }
    }
}

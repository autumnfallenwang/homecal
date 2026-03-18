import HomeCalKit
import SwiftUI

@main
struct HomeCalApp: App {
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
        }
    }
}

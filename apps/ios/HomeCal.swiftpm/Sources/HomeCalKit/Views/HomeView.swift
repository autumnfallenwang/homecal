import SwiftUI

public struct HomeView: View {
    @Environment(AuthManager.self) private var authManager
    @State private var isSigningOut = false

    public init() {}

    public var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()

                Image(systemName: "calendar")
                    .font(.system(size: 64))
                    .foregroundStyle(.tint)

                if let user = authManager.currentUser {
                    Text("Welcome, \(user.name)")
                        .font(.title2.bold())
                }

                Text("Calendar coming soon")
                    .foregroundStyle(.secondary)

                Spacer()
            }
            .padding()
            .navigationTitle("HomeCal")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await signOut() }
                    } label: {
                        if isSigningOut {
                            ProgressView()
                        } else {
                            Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                        }
                    }
                    .disabled(isSigningOut)
                }
            }
        }
    }

    private func signOut() async {
        isSigningOut = true
        defer { isSigningOut = false }

        try? await authManager.signOut()
    }
}

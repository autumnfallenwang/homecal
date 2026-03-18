import Foundation

@Observable
public final class AuthManager: @unchecked Sendable {
    public var currentUser: AuthUser?
    public var isLoading = true

    public var isAuthenticated: Bool {
        currentUser != nil
    }

    public let apiClient = APIClient()

    public init() {
        Task {
            await restoreSession()
        }
    }

    private func restoreSession() async {
        guard let token = KeychainService.loadToken() else {
            isLoading = false
            return
        }

        await apiClient.setBearerToken(token)

        do {
            let session = try await apiClient.getSession()
            currentUser = session.user
        } catch {
            KeychainService.deleteToken()
            await apiClient.setBearerToken(nil)
        }

        isLoading = false
    }

    public func signIn(email: String, password: String) async throws {
        let input = SignInRequest(email: email, password: password)
        let response = try await apiClient.signIn(input)

        if let token = await apiClient.bearerToken {
            KeychainService.save(token: token)
        }

        currentUser = response.user
    }

    public func signUp(name: String, email: String, password: String, color: String) async throws {
        let input = SignUpRequest(name: name, email: email, password: password, color: color)
        let response = try await apiClient.signUp(input)

        if let token = await apiClient.bearerToken {
            KeychainService.save(token: token)
        }

        currentUser = response.user
    }

    public func signOut() async throws {
        try await apiClient.signOut()
        KeychainService.deleteToken()
        currentUser = nil
    }
}

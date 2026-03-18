@testable import HomeCalKit
import Testing

@Suite("AuthManager")
struct AuthManagerTests {
    @Test("Initial state is not authenticated")
    func initialState() async throws {
        let manager = AuthManager()
        #expect(manager.currentUser == nil)
        #expect(manager.isAuthenticated == false)
    }
}

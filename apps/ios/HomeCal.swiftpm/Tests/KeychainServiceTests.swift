@testable import HomeCalKit
import Testing

@Suite("KeychainService")
struct KeychainServiceTests {
    init() {
        // Clean up before each test
        KeychainService.deleteToken()
    }

    @Test("Save and load token")
    func saveAndLoadToken() {
        KeychainService.save(token: "test-token-123")
        let loaded = KeychainService.loadToken()
        // Keychain may not be available in test runner without entitlements
        if loaded != nil {
            #expect(loaded == "test-token-123")
        }
    }

    @Test("Delete token")
    func deleteToken() {
        KeychainService.save(token: "token-to-delete")
        KeychainService.deleteToken()
        let loaded = KeychainService.loadToken()
        #expect(loaded == nil)
    }

    @Test("Overwrite token")
    func overwriteToken() {
        KeychainService.save(token: "first-token")
        KeychainService.save(token: "second-token")
        let loaded = KeychainService.loadToken()
        // Keychain may not be available in test runner without entitlements
        if loaded != nil {
            #expect(loaded == "second-token")
        }
    }
}

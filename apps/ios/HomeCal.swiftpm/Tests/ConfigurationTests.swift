@testable import AppModule
import Testing

@Suite("Configuration")
struct ConfigurationTests {
    @Test("API base URL is valid")
    func apiBaseURLIsValid() {
        let url = Configuration.apiBaseURL
        #expect(url.scheme == "http" || url.scheme == "https")
        #expect(url.host != nil)
    }
}

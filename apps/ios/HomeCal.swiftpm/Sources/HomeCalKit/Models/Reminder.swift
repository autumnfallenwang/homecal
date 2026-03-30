import Foundation

public struct EventReminder: Codable, Identifiable, Sendable {
    public let id: String
    public let minutesBefore: Int
}

public struct RegisterDeviceInput: Encodable, Sendable {
    public let platform: String
    public let token: String

    public init(platform: String = "ios", token: String) {
        self.platform = platform
        self.token = token
    }
}

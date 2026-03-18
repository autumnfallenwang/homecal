import Foundation

public struct SignInRequest: Encodable, Sendable {
    public let email: String
    public let password: String

    public init(email: String, password: String) {
        self.email = email
        self.password = password
    }
}

public struct SignUpRequest: Encodable, Sendable {
    public let name: String
    public let email: String
    public let password: String
    public let color: String

    public init(name: String, email: String, password: String, color: String) {
        self.name = name
        self.email = email
        self.password = password
        self.color = color
    }
}

public struct AuthUser: Decodable, Sendable {
    public let id: String
    public let name: String
    public let email: String
    public let color: String
    public let role: String?
    public let createdAt: Date
    public let updatedAt: Date
}

public struct AuthResponse: Decodable, Sendable {
    public let user: AuthUser
}

public struct SessionInfo: Decodable, Sendable {
    public let id: String
    public let userId: String
    public let token: String
    public let expiresAt: Date
}

public struct SessionResponse: Decodable, Sendable {
    public let user: AuthUser
    public let session: SessionInfo
}

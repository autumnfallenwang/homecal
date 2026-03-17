import Foundation

struct SignInRequest: Encodable, Sendable {
    let email: String
    let password: String
}

struct SignUpRequest: Encodable, Sendable {
    let name: String
    let email: String
    let password: String
    let color: String
}

struct AuthUser: Decodable, Sendable {
    let id: String
    let name: String
    let email: String
    let color: String
    let role: String?
    let createdAt: Date
    let updatedAt: Date
}

struct AuthResponse: Decodable, Sendable {
    let user: AuthUser
}

struct SessionInfo: Decodable, Sendable {
    let id: String
    let userId: String
    let token: String
    let expiresAt: Date
}

struct SessionResponse: Decodable, Sendable {
    let user: AuthUser
    let session: SessionInfo
}

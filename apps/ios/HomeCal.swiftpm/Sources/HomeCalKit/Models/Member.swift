import Foundation

public struct Member: Codable, Identifiable, Sendable {
    public let id: String
    public let name: String
    public let color: String
}

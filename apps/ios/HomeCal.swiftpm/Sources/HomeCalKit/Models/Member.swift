import Foundation

public struct Member: Decodable, Identifiable, Sendable {
    public let id: String
    public let name: String
    public let color: String
}

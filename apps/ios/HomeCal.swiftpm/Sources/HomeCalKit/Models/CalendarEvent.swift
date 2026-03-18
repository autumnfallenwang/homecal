import Foundation

public struct CalendarEvent: Codable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let start: Date
    public let end: Date
    public let ownerId: String
    public let isPrivate: Bool
    public let createdAt: Date
    public let updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, title, start, end, ownerId, createdAt, updatedAt
        case isPrivate = "private"
    }
}

public struct CalendarEventWithOwner: Codable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let start: Date
    public let end: Date
    public let ownerId: String
    public let isPrivate: Bool
    public let createdAt: Date
    public let updatedAt: Date
    public let owner: EventOwner

    enum CodingKeys: String, CodingKey {
        case id, title, start, end, ownerId, createdAt, updatedAt, owner
        case isPrivate = "private"
    }
}

public struct EventOwner: Codable, Sendable {
    public let id: String
    public let name: String
    public let color: String
}

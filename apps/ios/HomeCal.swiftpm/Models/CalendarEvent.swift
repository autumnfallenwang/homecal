import Foundation

struct CalendarEvent: Codable, Identifiable, Sendable {
    let id: String
    let title: String
    let start: Date
    let end: Date
    let ownerId: String
    let isPrivate: Bool
    let createdAt: Date
    let updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, title, start, end, ownerId, createdAt, updatedAt
        case isPrivate = "private"
    }
}

struct CalendarEventWithOwner: Codable, Identifiable, Sendable {
    let id: String
    let title: String
    let start: Date
    let end: Date
    let ownerId: String
    let isPrivate: Bool
    let createdAt: Date
    let updatedAt: Date
    let owner: EventOwner

    enum CodingKeys: String, CodingKey {
        case id, title, start, end, ownerId, createdAt, updatedAt, owner
        case isPrivate = "private"
    }
}

struct EventOwner: Codable, Sendable {
    let id: String
    let name: String
    let color: String
}

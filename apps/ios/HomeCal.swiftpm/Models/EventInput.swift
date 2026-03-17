import Foundation

struct CreateEventInput: Encodable, Sendable {
    let title: String
    let start: String
    let end: String
    let isPrivate: Bool?

    enum CodingKeys: String, CodingKey {
        case title, start, end
        case isPrivate = "private"
    }
}

struct UpdateEventInput: Encodable, Sendable {
    var title: String?
    var start: String?
    var end: String?
    var isPrivate: Bool?

    enum CodingKeys: String, CodingKey {
        case title, start, end
        case isPrivate = "private"
    }
}

struct ParseEventInput: Encodable, Sendable {
    let text: String
}

struct ParsedEvent: Decodable, Sendable {
    let title: String
    let start: String
    let end: String
}

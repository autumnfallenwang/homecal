import Foundation

public struct CreateEventInput: Encodable, Sendable {
    public let title: String
    public let start: String
    public let end: String
    public let isPrivate: Bool?

    public init(title: String, start: String, end: String, isPrivate: Bool? = nil) {
        self.title = title
        self.start = start
        self.end = end
        self.isPrivate = isPrivate
    }

    enum CodingKeys: String, CodingKey {
        case title, start, end
        case isPrivate = "private"
    }
}

public struct UpdateEventInput: Encodable, Sendable {
    public var title: String?
    public var start: String?
    public var end: String?
    public var isPrivate: Bool?

    public init(title: String? = nil, start: String? = nil, end: String? = nil, isPrivate: Bool? = nil) {
        self.title = title
        self.start = start
        self.end = end
        self.isPrivate = isPrivate
    }

    enum CodingKeys: String, CodingKey {
        case title, start, end
        case isPrivate = "private"
    }
}

public struct ParseEventInput: Encodable, Sendable {
    public let text: String

    public init(text: String) {
        self.text = text
    }
}

public struct ParsedEvent: Decodable, Sendable {
    public let title: String
    public let start: String
    public let end: String
}

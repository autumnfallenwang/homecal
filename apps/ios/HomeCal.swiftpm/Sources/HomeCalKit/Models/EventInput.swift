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

extension ParsedEvent {
    /// Parse ISO8601 string treating time components as local time.
    /// The API returns UTC strings where the hours represent the user's intended local time.
    public static func dateFromISOLocalTime(_ iso: String) -> Date? {
        guard iso.count >= 16 else { return nil }
        let prefix = String(iso.prefix(16)) // "YYYY-MM-DDTHH:MM"
        let parts = prefix.split(separator: "T")
        guard parts.count == 2 else { return nil }
        let dateParts = parts[0].split(separator: "-")
        let timeParts = parts[1].split(separator: ":")
        guard dateParts.count == 3, timeParts.count == 2,
              let year = Int(dateParts[0]),
              let month = Int(dateParts[1]),
              let day = Int(dateParts[2]),
              let hour = Int(timeParts[0]),
              let minute = Int(timeParts[1]) else { return nil }

        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = day
        components.hour = hour
        components.minute = minute
        return Calendar.current.date(from: components)
    }

    public func localStartDate() -> Date? {
        Self.dateFromISOLocalTime(start)
    }

    public func localEndDate() -> Date? {
        Self.dateFromISOLocalTime(end)
    }
}

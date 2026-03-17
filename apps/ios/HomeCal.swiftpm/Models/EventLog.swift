import Foundation

struct EventLogEntry: Decodable, Identifiable, Sendable {
    let id: String
    let eventId: String
    let userId: String
    let action: String
    let changes: [String: JSONValue]?
    let timestamp: Date
    let user: EventLogUser
}

struct EventLogUser: Decodable, Sendable {
    let id: String
    let name: String
    let color: String
}

enum JSONValue: Sendable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case null
}

extension JSONValue: Decodable {
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Int.self) {
            self = .int(value)
        } else if let value = try? container.decode(Double.self) {
            self = .double(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else {
            self = .null
        }
    }
}

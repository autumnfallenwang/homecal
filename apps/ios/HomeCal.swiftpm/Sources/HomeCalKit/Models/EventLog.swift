import Foundation

public struct EventLogEntry: Decodable, Identifiable, Sendable {
    public let id: String
    public let action: String
    public let changes: [String: FieldChange]?
    public let timestamp: Date
    public let user: EventLogUser
}

public struct FieldChange: Decodable, Sendable {
    public let from: JSONValue
    public let to: JSONValue
}

public struct EventLogUser: Decodable, Sendable {
    public let id: String
    public let name: String
    public let color: String
}

public enum JSONValue: Sendable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case null
}

extension JSONValue: Decodable {
    public init(from decoder: Decoder) throws {
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

import Foundation

struct Member: Decodable, Identifiable, Sendable {
    let id: String
    let name: String
    let color: String
}

import Foundation

struct Category: Codable, Identifiable, Hashable {
    let id: String
    let name: LocalizedText
    let imageURL: URL
    let sortOrder: Int
}

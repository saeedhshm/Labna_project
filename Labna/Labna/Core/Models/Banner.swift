import Foundation

struct Banner: Codable, Identifiable, Hashable {
    struct Destination: Codable, Hashable {
        enum Kind: String, Codable {
            case product, category
        }
        let kind: Kind
        let id: String
    }

    let id: String
    let title: LocalizedText
    let subtitle: LocalizedText
    let imageURL: URL
    let destination: Destination
    let sortOrder: Int
}

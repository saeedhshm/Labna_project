import Foundation

struct DemoOrder: Codable, Identifiable, Hashable {
    // Immutable snapshots remain readable even if the catalog changes later.
    struct Line: Codable, Hashable {
        let productID: String
        let variantID: String
        let productName: LocalizedText
        let variantLabel: LocalizedText
        let unitPriceMinor: Int
        let quantity: Int

        var subtotalMinor: Int { unitPriceMinor * quantity }
    }

    let id: String
    let createdAt: Date
    let currencyCode: String
    let lines: [Line]
    let notes: String?

    var totalMinor: Int { lines.reduce(0) { $0 + $1.subtotalMinor } }
}

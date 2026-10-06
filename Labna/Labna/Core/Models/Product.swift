import Foundation

struct Product: Codable, Identifiable, Hashable {
    let id: String
    let categoryID: String
    let name: LocalizedText
    let description: LocalizedText
    let imageURLs: [URL]
    let ingredients: LocalizedText
    let storageInstructions: LocalizedText
    let isFeatured: Bool
    let variants: [ProductVariant]

    var isAvailable: Bool { variants.contains(where: \.isAvailable) }
    var startingPriceMinor: Int? {
        variants.filter(\.isAvailable).map(\.priceMinor).min()
    }
}

struct ProductVariant: Codable, Identifiable, Hashable {
    enum Unit: String, Codable {
        case ml, g
    }

    let id: String
    let label: LocalizedText
    let quantity: Int
    let unit: Unit
    // Integer minor units: 4500 = EGP 45.00. Never use floating point for totals.
    let priceMinor: Int
    let currencyCode: String
    let isAvailable: Bool
}

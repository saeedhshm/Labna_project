import Foundation

struct CartItem: Codable, Identifiable, Hashable {
    struct ID: Codable, Hashable {
        let productID: String
        let variantID: String
    }

    let productID: String
    let variantID: String
    var quantity: Int
    let productName: LocalizedText
    let variantLabel: LocalizedText
    let priceAtAdditionMinor: Int
    let currencyCode: String

    var id: ID { ID(productID: productID, variantID: variantID) }
}

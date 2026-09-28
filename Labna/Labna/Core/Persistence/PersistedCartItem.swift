import Foundation
import SwiftData

@Model
final class PersistedCartItem {
    @Attribute(.unique) var key: String
    var productID: String
    var variantID: String
    var quantity: Int
    var productNameAR: String
    var productNameEN: String
    var variantLabelAR: String
    var variantLabelEN: String
    var priceAtAdditionMinor: Int
    var currencyCode: String
    var createdAt: Date

    init(item: CartItem, createdAt: Date = .now) {
        key = Self.key(productID: item.productID, variantID: item.variantID)
        productID = item.productID
        variantID = item.variantID
        quantity = item.quantity
        productNameAR = item.productName.ar
        productNameEN = item.productName.en
        variantLabelAR = item.variantLabel.ar
        variantLabelEN = item.variantLabel.en
        priceAtAdditionMinor = item.priceAtAdditionMinor
        currencyCode = item.currencyCode
        self.createdAt = createdAt
    }

    var item: CartItem {
        CartItem(
            productID: productID,
            variantID: variantID,
            quantity: quantity,
            productName: LocalizedText(ar: productNameAR, en: productNameEN),
            variantLabel: LocalizedText(ar: variantLabelAR, en: variantLabelEN),
            priceAtAdditionMinor: priceAtAdditionMinor,
            currencyCode: currencyCode
        )
    }

    func update(from item: CartItem) {
        quantity = item.quantity
        productNameAR = item.productName.ar
        productNameEN = item.productName.en
        variantLabelAR = item.variantLabel.ar
        variantLabelEN = item.variantLabel.en
        priceAtAdditionMinor = item.priceAtAdditionMinor
        currencyCode = item.currencyCode
    }

    static func key(productID: String, variantID: String) -> String {
        "\(productID)::\(variantID)"
    }
}

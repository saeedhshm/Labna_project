import Foundation
import SwiftUI

/// Request body for `POST /cart/validate`.
///
/// The backend contract (`cartValidationRequest`) is a strict object, so only the
/// identifiers and the requested quantity are ever sent. Prices, stock figures
/// and totals are never included: the server is the only authority for them and
/// it rejects unknown keys outright.
struct CartValidationRequest: Encodable, Sendable {
    struct Item: Encodable, Sendable {
        let productID: String
        let variantID: String
        let quantity: Int
    }

    let items: [Item]
    let branchID: String?

    /// Swift's synthesized encoding uses `encodeIfPresent`, so an unset
    /// `branchID` is omitted rather than sent as `null`, which the strict
    /// schema would reject.
    init(items: [CartItem], branchID: String? = nil) {
        self.items = items.map { Item(productID: $0.productID, variantID: $0.variantID, quantity: $0.quantity) }
        self.branchID = branchID
    }
}

/// Why the server rejected or accepted a single cart line.
///
/// Raw values match `reason` in `cartValidationItem` from `@labna/contracts`.
/// The availability rules behind these reasons stay on the server; the app only
/// renders the outcome.
enum CartValidationReason: String, Decodable, Sendable, Equatable {
    case ok
    case productNotFound = "product_not_found"
    case variantNotFound = "variant_not_found"
    case unavailable
    case insufficientStock = "insufficient_stock"

    var messageKey: LocalizedStringKey {
        switch self {
        case .ok: ""
        case .productNotFound: "cart.productRemoved"
        case .variantNotFound: "cart.variantRemoved"
        case .unavailable: "cart.variantUnavailable"
        case .insufficientStock: "cart.insufficientStock"
        }
    }

    /// Whether the line blocks checkout.
    var isBlocking: Bool { self != .ok }
}

/// One validated line from `cartValidationResponse.items`.
///
/// Every price and stock figure here comes from the server for the requested
/// quantity, so the app never derives checkout totals locally.
struct CartValidatedItem: Decodable, Sendable, Equatable {
    let productID: String
    let variantID: String
    let quantity: Int
    let productName: LocalizedText
    let variantLabel: LocalizedText
    let imageURL: URL
    let unit: ProductVariant.Unit
    let variantQuantity: Int
    let currencyCode: String
    let unitPriceMinor: Int
    let lineTotalMinor: Int
    let availableQuantity: Int
    let valid: Bool
    let reason: CartValidationReason

    var line: CartItem.ID { CartItem.ID(productID: productID, variantID: variantID) }

    /// Compares the price captured when the line was added against the price the
    /// server reports now, so the cart can show
    /// `price at addition → current server price`.
    func priceChanged(from priceAtAdditionMinor: Int) -> Bool {
        unitPriceMinor != priceAtAdditionMinor
    }
}

/// The whole `POST /cart/validate` response payload.
struct CartValidationResult: Decodable, Sendable, Equatable {
    let branchID: String
    let currencyCode: String
    let items: [CartValidatedItem]
    let subtotalMinor: Int
    let valid: Bool

    var blockingItems: [CartValidatedItem] { items.filter { !$0.valid } }
}
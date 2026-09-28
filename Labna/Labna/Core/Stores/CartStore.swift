import Foundation
import Observation
import SwiftData

enum CartAvailability: Equatable {
    case available
    case productRemoved
    case variantRemoved
    case unavailable
}

struct CartLine: Identifiable, Equatable {
    let item: CartItem
    let product: Product?
    let variant: ProductVariant?
    let availability: CartAvailability

    var id: CartItem.ID { item.id }
    var isAvailable: Bool { availability == .available }
    var currentUnitPriceMinor: Int? { isAvailable ? variant?.priceMinor : nil }
    var hasPriceChanged: Bool {
        guard let currentUnitPriceMinor else { return false }
        return currentUnitPriceMinor != item.priceAtAdditionMinor
    }
    var currentSubtotalMinor: Int? {
        currentUnitPriceMinor.map { $0 * item.quantity }
    }
}

@MainActor
@Observable
final class CartStore {
    private let context: ModelContext
    private(set) var items: [CartItem] = []
    private(set) var lines: [CartLine] = []
    private(set) var persistenceFailed = false
    private var catalogProducts: [Product] = []

    var totalQuantity: Int { items.reduce(0) { $0 + $1.quantity } }
    var availableQuantity: Int { lines.filter(\.isAvailable).reduce(0) { $0 + $1.item.quantity } }
    var totalMinor: Int { lines.compactMap(\.currentSubtotalMinor).reduce(0, +) }
    var currencyCode: String { lines.first(where: \.isAvailable)?.variant?.currencyCode ?? "EGP" }
    var containsUnavailableItems: Bool { lines.contains { !$0.isAvailable } }

    init(modelContainer: ModelContainer) {
        context = ModelContext(modelContainer)
        restore()
    }

    func add(product: Product, variant: ProductVariant, quantity: Int) {
        guard quantity > 0, variant.isAvailable, product.variants.contains(where: { $0.id == variant.id }) else { return }
        let id = CartItem.ID(productID: product.id, variantID: variant.id)
        if let index = items.firstIndex(where: { $0.id == id }) {
            items[index].quantity += quantity
            // Any new addition accepts the current catalog price for the merged line.
            items[index] = CartItem(
                productID: product.id,
                variantID: variant.id,
                quantity: items[index].quantity,
                productName: product.name,
                variantLabel: variant.label,
                priceAtAdditionMinor: variant.priceMinor,
                currencyCode: variant.currencyCode
            )
        } else {
            items.append(CartItem(
                productID: product.id,
                variantID: variant.id,
                quantity: quantity,
                productName: product.name,
                variantLabel: variant.label,
                priceAtAdditionMinor: variant.priceMinor,
                currencyCode: variant.currencyCode
            ))
        }
        review(using: catalogProducts.isEmpty ? [product] : catalogProducts)
        persist()
    }

    func setQuantity(_ quantity: Int, for id: CartItem.ID) {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        if quantity <= 0 {
            items.remove(at: index)
        } else {
            items[index].quantity = min(quantity, 99)
        }
        review(using: catalogProducts)
        persist()
    }

    func remove(_ id: CartItem.ID) {
        items.removeAll { $0.id == id }
        review(using: catalogProducts)
        persist()
    }

    func removeAll() {
        items.removeAll()
        review(using: catalogProducts)
        persist()
    }

    func review(using products: [Product]) {
        catalogProducts = products
        let productsByID = Dictionary(uniqueKeysWithValues: products.map { ($0.id, $0) })
        lines = items.map { item in
            guard let product = productsByID[item.productID] else {
                return CartLine(item: item, product: nil, variant: nil, availability: .productRemoved)
            }
            guard let variant = product.variants.first(where: { $0.id == item.variantID }) else {
                return CartLine(item: item, product: product, variant: nil, availability: .variantRemoved)
            }
            return CartLine(
                item: item,
                product: product,
                variant: variant,
                availability: variant.isAvailable ? .available : .unavailable
            )
        }
    }

    private func restore() {
        do {
            let descriptor = FetchDescriptor<PersistedCartItem>(sortBy: [SortDescriptor(\.createdAt)])
            items = try context.fetch(descriptor).map(\.item).filter { $0.quantity > 0 }
        } catch {
            persistenceFailed = true
            items = []
        }
        review(using: [])
    }

    private func persist() {
        do {
            let stored = try context.fetch(FetchDescriptor<PersistedCartItem>())
            let itemsByKey = Dictionary(uniqueKeysWithValues: items.map {
                (PersistedCartItem.key(productID: $0.productID, variantID: $0.variantID), $0)
            })
            for model in stored {
                if let item = itemsByKey[model.key] {
                    model.update(from: item)
                } else {
                    context.delete(model)
                }
            }
            let existingKeys = Set(stored.map(\.key))
            for (key, item) in itemsByKey where !existingKeys.contains(key) {
                context.insert(PersistedCartItem(item: item))
            }
            try context.save()
            persistenceFailed = false
        } catch {
            persistenceFailed = true
        }
    }
}

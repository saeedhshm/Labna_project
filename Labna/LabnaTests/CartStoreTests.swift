import Foundation
import Testing
@testable import Labna

@MainActor
struct CartStoreTests {
    private func products() throws -> [Product] {
        let url = try #require(Bundle.main.url(forResource: "products", withExtension: "json"))
        return try JSONDecoder().decode([Product].self, from: Data(contentsOf: url))
    }

    private func replacing(_ product: Product, variants: [ProductVariant]) -> Product {
        Product(
            id: product.id,
            categoryID: product.categoryID,
            name: product.name,
            description: product.description,
            imageURLs: product.imageURLs,
            ingredients: product.ingredients,
            storageInstructions: product.storageInstructions,
            isFeatured: product.isFeatured,
            isDemo: product.isDemo,
            variants: variants
        )
    }

    private func replacing(
        _ variant: ProductVariant,
        price: Int? = nil,
        available: Bool? = nil
    ) -> ProductVariant {
        ProductVariant(
            id: variant.id,
            label: variant.label,
            quantity: variant.quantity,
            unit: variant.unit,
            priceMinor: price ?? variant.priceMinor,
            currencyCode: variant.currencyCode,
            isAvailable: available ?? variant.isAvailable
        )
    }

    @Test func cartPersistsQuantityAndRemovalAcrossStoreInstances() throws {
        let product = try #require(products().first { $0.id == "milk-full" })
        let small = product.variants[0]
        let large = product.variants[1]
        let container = PersistenceContainer.make(inMemory: true)

        let first = CartStore(modelContainer: container)
        first.review(using: [product])
        first.add(product: product, variant: small, quantity: 2)
        first.add(product: product, variant: large, quantity: 1)

        let restored = CartStore(modelContainer: container)
        restored.review(using: [product])
        #expect(restored.items.count == 2)
        #expect(restored.totalQuantity == 3)
        restored.setQuantity(5, for: CartItem.ID(productID: product.id, variantID: small.id))
        restored.remove(CartItem.ID(productID: product.id, variantID: large.id))

        let restoredAgain = CartStore(modelContainer: container)
        restoredAgain.review(using: [product])
        #expect(restoredAgain.items.count == 1)
        #expect(restoredAgain.items[0].quantity == 5)
        #expect(restoredAgain.totalMinor == small.priceMinor * 5)
    }

    @Test func reviewReportsPriceAndAvailabilityChangesWithoutDeletingItems() throws {
        let product = try #require(products().first { $0.id == "milk-full" })
        let variant = product.variants[0]
        let cart = CartStore(modelContainer: PersistenceContainer.make(inMemory: true))
        cart.add(product: product, variant: variant, quantity: 2)

        let newPrice = variant.priceMinor + 700
        let changedVariant = replacing(variant, price: newPrice)
        cart.review(using: [replacing(product, variants: [changedVariant] + Array(product.variants.dropFirst()))])
        #expect(cart.lines[0].availability == .available)
        #expect(cart.lines[0].hasPriceChanged)
        #expect(cart.lines[0].item.priceAtAdditionMinor == variant.priceMinor)
        #expect(cart.totalMinor == newPrice * 2)

        let unavailable = replacing(changedVariant, available: false)
        cart.review(using: [replacing(product, variants: [unavailable] + Array(product.variants.dropFirst()))])
        #expect(cart.lines[0].availability == .unavailable)
        #expect(cart.totalMinor == 0)
        #expect(cart.items.count == 1)

        cart.review(using: [replacing(product, variants: Array(product.variants.dropFirst()))])
        #expect(cart.lines[0].availability == .variantRemoved)
        cart.review(using: [])
        #expect(cart.lines[0].availability == .productRemoved)
        #expect(cart.items.count == 1)
    }

    @Test func unavailableVariantCannotBeAdded() throws {
        let product = try #require(products().first { $0.id == "milk-buffalo" })
        let unavailable = try #require(product.variants.first { !$0.isAvailable })
        let cart = CartStore(modelContainer: PersistenceContainer.make(inMemory: true))
        cart.review(using: [product])
        cart.add(product: product, variant: unavailable, quantity: 1)
        #expect(cart.items.isEmpty)
    }

    @Test func quantityIsCappedAndZeroRemovesTheLine() throws {
        let product = try #require(products().first { $0.id == "milk-full" })
        let variant = product.variants[0]
        let cart = CartStore(modelContainer: PersistenceContainer.make(inMemory: true))
        cart.review(using: [product])
        cart.add(product: product, variant: variant, quantity: 1)
        let id = CartItem.ID(productID: product.id, variantID: variant.id)
        cart.setQuantity(120, for: id)
        #expect(cart.items[0].quantity == 99)
        cart.setQuantity(0, for: id)
        #expect(cart.items.isEmpty)
        #expect(cart.lines.isEmpty)
    }
}

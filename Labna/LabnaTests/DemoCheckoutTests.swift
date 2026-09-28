import Foundation
import SwiftData
import Testing
@testable import Labna

@MainActor
struct DemoCheckoutTests {
    private func products() throws -> [Product] {
        let url = try #require(Bundle.main.url(forResource: "products", withExtension: "json"))
        return try JSONDecoder().decode([Product].self, from: Data(contentsOf: url))
    }

    private func cartWithMilk(container: ModelContainer) throws -> (CartStore, Product, ProductVariant) {
        let product = try #require(products().first { $0.id == "milk-full" })
        let variant = product.variants[0]
        let cart = CartStore(modelContainer: container)
        cart.review(using: [product])
        cart.add(product: product, variant: variant, quantity: 2)
        return (cart, product, variant)
    }

    @Test func confirmationSnapshotsCurrentDataAndClearsPersistedCart() async throws {
        let container = PersistenceContainer.make(inMemory: true)
        let (cart, product, variant) = try cartWithMilk(container: container)
        let checkout = DemoCheckoutStore(processingDelay: .zero)
        let order = try #require(await checkout.confirm(cart: cart, notes: "  Leave at reception  "))

        #expect(order.id.hasPrefix("DEMO-"))
        #expect(order.currencyCode == "EGP")
        #expect(order.lines.count == 1)
        #expect(order.lines[0].productName == product.name)
        #expect(order.lines[0].variantLabel == variant.label)
        #expect(order.lines[0].unitPriceMinor == variant.priceMinor)
        #expect(order.lines[0].quantity == 2)
        #expect(order.totalMinor == variant.priceMinor * 2)
        #expect(order.notes == "Leave at reception")
        #expect(cart.items.isEmpty)
        #expect(CartStore(modelContainer: container).items.isEmpty)
    }

    @Test func duplicateConfirmationIsIgnoredWhileProcessing() async throws {
        let container = PersistenceContainer.make(inMemory: true)
        let (cart, _, _) = try cartWithMilk(container: container)
        let checkout = DemoCheckoutStore(processingDelay: .milliseconds(50))
        let first = Task { await checkout.confirm(cart: cart, notes: "") }
        await Task.yield()
        #expect(checkout.isProcessing)
        let duplicate = await checkout.confirm(cart: cart, notes: "duplicate")
        #expect(duplicate == nil)
        let order = await first.value
        #expect(order != nil)
        #expect(cart.items.isEmpty)
    }

    @Test func unavailableItemsFailValidationAndRemainInCart() async throws {
        let container = PersistenceContainer.make(inMemory: true)
        let (cart, product, variant) = try cartWithMilk(container: container)
        let unavailableVariant = ProductVariant(
            id: variant.id,
            label: variant.label,
            quantity: variant.quantity,
            unit: variant.unit,
            priceMinor: variant.priceMinor,
            currencyCode: variant.currencyCode,
            isAvailable: false
        )
        let unavailableProduct = Product(
            id: product.id,
            categoryID: product.categoryID,
            name: product.name,
            description: product.description,
            imageURLs: product.imageURLs,
            ingredients: product.ingredients,
            storageInstructions: product.storageInstructions,
            isFeatured: product.isFeatured,
            isDemo: product.isDemo,
            variants: [unavailableVariant] + Array(product.variants.dropFirst())
        )
        cart.review(using: [unavailableProduct])
        let checkout = DemoCheckoutStore(processingDelay: .zero)
        #expect(await checkout.confirm(cart: cart, notes: "") == nil)
        #expect(checkout.error == .unavailableItems)
        #expect(cart.items.count == 1)
    }

    @Test func emptyCartCannotBeConfirmed() async {
        let cart = CartStore(modelContainer: PersistenceContainer.make(inMemory: true))
        let checkout = DemoCheckoutStore(processingDelay: .zero)
        #expect(await checkout.confirm(cart: cart, notes: "") == nil)
        #expect(checkout.error == .emptyCart)
    }
}

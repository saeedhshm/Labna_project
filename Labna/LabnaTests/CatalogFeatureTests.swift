import Foundation
import Testing
@testable import Labna

@MainActor
struct CatalogFeatureTests {
    private func products() throws -> [Product] {
        let url = try #require(Bundle.main.url(forResource: "products", withExtension: "json"))
        return try JSONDecoder().decode([Product].self, from: Data(contentsOf: url))
    }

    @Test func searchUsesDisplayedLanguageAndCategory() throws {
        let products = try products()
        let arabic = CatalogQuery.products(
            from: products,
            searchText: "جاموسي",
            categoryID: "milk",
            sort: .featured,
            language: .arabic
        )
        let english = CatalogQuery.products(
            from: products,
            searchText: "Greek",
            categoryID: "yogurt",
            sort: .featured,
            language: .english
        )
        let wrongLanguage = CatalogQuery.products(
            from: products,
            searchText: "Greek",
            categoryID: nil,
            sort: .featured,
            language: .arabic
        )
        #expect(arabic.map(\.id) == ["milk-buffalo"])
        #expect(english.map(\.id) == ["yogurt-greek"])
        #expect(wrongLanguage.isEmpty)
    }

    @Test func priceSortUsesLowestAvailableVariantAndKeepsSoldOutLast() throws {
        let products = try products()
        let ascending = CatalogQuery.products(
            from: products,
            searchText: "",
            categoryID: nil,
            sort: .priceLowToHigh,
            language: .english
        )
        let descending = CatalogQuery.products(
            from: products,
            searchText: "",
            categoryID: nil,
            sort: .priceHighToLow,
            language: .english
        )
        #expect(ascending.first?.id == "yogurt-natural")
        #expect(descending.first?.id == "cream-whipping")
        #expect(ascending.last?.id == "cheese-roumy")
        #expect(descending.last?.id == "cheese-roumy")
        let buffalo = try #require(ascending.first { $0.id == "milk-buffalo" })
        #expect(buffalo.startingPriceMinor == 4000)
    }

    @Test func inMemoryCartMergesSamePackAndSeparatesDifferentPacks() throws {
        let product = try #require(products().first { $0.id == "milk-full" })
        let small = product.variants[0]
        let large = product.variants[1]
        let cart = CartStore(modelContainer: PersistenceContainer.make(inMemory: true))
        cart.review(using: [product])
        cart.add(product: product, variant: small, quantity: 2)
        cart.add(product: product, variant: small, quantity: 1)
        cart.add(product: product, variant: large, quantity: 2)
        cart.add(product: product, variant: large, quantity: 0)
        #expect(cart.items.count == 2)
        #expect(cart.items.first { $0.variantID == small.id }?.quantity == 3)
        #expect(cart.totalQuantity == 5)
        #expect(cart.totalMinor == (small.priceMinor * 3) + (large.priceMinor * 2))
    }
}

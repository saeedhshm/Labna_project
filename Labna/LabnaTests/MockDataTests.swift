import Foundation
import Testing
@testable import Labna

@MainActor
struct MockDataTests {
    private func load<T: Decodable>(_ name: String, as type: T.Type) throws -> T {
        let url = try #require(Bundle.main.url(forResource: name, withExtension: "json"))
        return try JSONDecoder().decode(type, from: Data(contentsOf: url))
    }

    private func checkText(_ text: LocalizedText) {
        #expect(!text.ar.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        #expect(!text.en.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    private func checkImage(_ url: URL) {
        #expect(url.scheme == "https")
        #expect(url.host != nil)
    }

    @Test func bundledCatalogIsConsistent() throws {
        let categories = try load("categories", as: [Labna.Category].self)
        let products = try load("products", as: [Product].self)
        let banners = try load("banners", as: [Banner].self)
        #expect(categories.count == 5)
        #expect(products.count == 15)
        #expect(!banners.isEmpty)
        let categoryIDs = Set(categories.map(\.id))
        let productIDs = Set(products.map(\.id))
        #expect(categoryIDs.count == categories.count)
        #expect(productIDs.count == products.count)
        #expect(Set(banners.map(\.id)).count == banners.count)
        let variants = products.flatMap(\.variants)
        #expect(Set(variants.map(\.id)).count == variants.count)

        for category in categories {
            #expect(!category.id.isEmpty)
            checkText(category.name)
            checkImage(category.imageURL)
            #expect(products.contains { $0.categoryID == category.id })
        }
        for product in products {
            #expect(!product.id.isEmpty)
            #expect(categoryIDs.contains(product.categoryID))
            #expect(product.isDemo)
            #expect((1...3).contains(product.variants.count))
            #expect(!product.imageURLs.isEmpty)
            product.imageURLs.forEach(checkImage)
            [product.name, product.description, product.ingredients, product.storageInstructions].forEach(checkText)
            for variant in product.variants {
                #expect(!variant.id.isEmpty)
                checkText(variant.label)
                #expect(variant.priceMinor > 0)
                #expect(variant.quantity > 0)
                #expect(variant.currencyCode == "EGP")
            }
        }
        for banner in banners {
            checkText(banner.title)
            checkText(banner.subtitle)
            checkImage(banner.imageURL)
            switch banner.destination.kind {
            case .category: #expect(categoryIDs.contains(banner.destination.id))
            case .product: #expect(productIDs.contains(banner.destination.id))
            }
        }
        // Fixtures intentionally exercise single/multiple packs and unavailable items.
        #expect(products.contains { $0.variants.count == 1 })
        #expect(products.contains { $0.variants.count == 3 })
        let soldOut = try #require(products.first { $0.id == "cheese-roumy" })
        #expect(!soldOut.isAvailable)
        #expect(soldOut.startingPriceMinor == nil)
        let milk = try #require(products.first { $0.id == "milk-full" })
        #expect(milk.startingPriceMinor == 1800)
    }

    @Test func demoBranchesHaveValidLocationsAndHours() throws {
        let branches = try load("branches", as: [Branch].self)
        #expect(branches.count == 2)
        #expect(Set(branches.map(\.id)).count == branches.count)
        for branch in branches {
            checkText(branch.name)
            checkText(branch.address)
            #expect(branch.isDemo)
            #expect(branch.phoneNumber == nil)
            #expect((-90...90).contains(branch.coordinate.latitude))
            #expect((-180...180).contains(branch.coordinate.longitude))
            #expect(TimeZone(identifier: branch.timeZoneIdentifier) != nil)
            #expect(Set(branch.openingHours.map(\.weekday)) == Set(1...7))
            #expect(branch.openingHours.count == 7)
            for hours in branch.openingHours {
                for time in [hours.opensAt, hours.closesAt] {
                    #expect(time.range(of: #"^([01][0-9]|2[0-3]):[0-5][0-9]$"#, options: .regularExpression) != nil)
                }
                #expect(hours.opensAt < hours.closesAt)
            }
        }
    }

    @Test func cartIdentityAndOrderSnapshotRoundTrip() throws {
        let products = try load("products", as: [Product].self)
        let product = try #require(products.first { $0.id == "milk-full" })
        let small = product.variants[0]
        let large = product.variants[1]
        let first = CartItem(
            productID: product.id, variantID: small.id, quantity: 2,
            productName: product.name, variantLabel: small.label,
            priceAtAdditionMinor: small.priceMinor, currencyCode: small.currencyCode
        )
        let second = CartItem(
            productID: product.id, variantID: large.id, quantity: 1,
            productName: product.name, variantLabel: large.label,
            priceAtAdditionMinor: large.priceMinor, currencyCode: large.currencyCode
        )
        #expect(first.id != second.id)
        #expect(first.id == CartItem(
            productID: product.id, variantID: small.id, quantity: 3,
            productName: product.name, variantLabel: small.label,
            priceAtAdditionMinor: small.priceMinor, currencyCode: small.currencyCode
        ).id)
        let encoder = JSONEncoder()
        let decoder = JSONDecoder()
        #expect(try decoder.decode([CartItem].self, from: encoder.encode([first, second])) == [first, second])
        let order = DemoOrder(id: "DEMO-TEST", createdAt: Date(timeIntervalSince1970: 0), currencyCode: "EGP", lines: [
            .init(productID: product.id, variantID: small.id, productName: product.name, variantLabel: small.label, unitPriceMinor: small.priceMinor, quantity: 2),
            .init(productID: product.id, variantID: large.id, productName: product.name, variantLabel: large.label, unitPriceMinor: large.priceMinor, quantity: 1)
        ], notes: nil)
        let restored = try decoder.decode(DemoOrder.self, from: encoder.encode(order))
        #expect(restored == order)
        #expect(restored.totalMinor == 6600)
        #expect(restored.lines[0].productName.value(for: .arabic) == "حليب كامل الدسم")
        #expect(restored.lines[0].productName.value(for: .english) == "Full Cream Milk")
    }
}

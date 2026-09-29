import Foundation
import Testing
@testable import Labna

@MainActor
struct RecentlyViewedStoreTests {
    @Test func recentlyViewedUpdatesExistingProductsAndPersistsNewestFirst() {
        let container = PersistenceContainer.make(inMemory: true)
        let base = Date(timeIntervalSince1970: 1_000)
        let first = RecentlyViewedStore(modelContainer: container, limit: 20)

        first.record(productID: "milk-full", viewedAt: base)
        first.record(productID: "yogurt-greek", viewedAt: base.addingTimeInterval(10))
        first.record(productID: "milk-full", viewedAt: base.addingTimeInterval(20))

        #expect(first.productIDs == ["milk-full", "yogurt-greek"])

        let restored = RecentlyViewedStore(modelContainer: container, limit: 20)
        #expect(restored.productIDs == ["milk-full", "yogurt-greek"])
    }

    @Test func recentlyViewedKeepsOnlyMostRecentLimit() {
        let container = PersistenceContainer.make(inMemory: true)
        let store = RecentlyViewedStore(modelContainer: container, limit: 3)

        for index in 0..<5 {
            store.record(productID: "product-\(index)", viewedAt: Date(timeIntervalSince1970: TimeInterval(index)))
        }

        #expect(store.productIDs == ["product-4", "product-3", "product-2"])

        let restored = RecentlyViewedStore(modelContainer: container, limit: 3)
        #expect(restored.productIDs == ["product-4", "product-3", "product-2"])
    }
}

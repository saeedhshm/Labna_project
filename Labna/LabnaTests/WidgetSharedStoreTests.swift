import Foundation
import Testing
@testable import Labna

struct WidgetSharedStoreTests {
    private func snapshot(
        id: String = "milk-full",
        nameAR: String = "لبن كامل الدسم",
        nameEN: String = "Full Cream Milk",
        priceMinor: Int = 4500,
        updatedAt: Date = Date(timeIntervalSince1970: 1_700_000_000)
    ) -> WidgetProductSnapshot {
        WidgetProductSnapshot(
            id: id,
            nameAR: nameAR,
            nameEN: nameEN,
            priceMinor: priceMinor,
            currencyCode: "EGP",
            imageURL: URL(string: "https://example.com/milk.jpg"),
            cachedImageName: "featured-product.jpg",
            updatedAt: updatedAt
        )
    }

    /// Uses a private suite so tests never touch the production App Group.
    private func makeStore() throws -> (WidgetSharedDefaultsStore, String) {
        let suiteName = "LabnaTests.WidgetSharedStore.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suiteName))
        return (WidgetSharedDefaultsStore(defaults: defaults), suiteName)
    }

    @Test func writesAndReadsBackASnapshot() throws {
        let (store, suiteName) = try makeStore()
        defer { UserDefaults().removePersistentDomain(forName: suiteName) }

        #expect(store.load() == nil, "No snapshot yet")

        let product = snapshot()
        try store.save(WidgetSharedState(language: .english, featuredProduct: product, updatedAt: product.updatedAt))

        let loaded = try #require(store.load())
        #expect(loaded.featuredProduct == product)
        #expect(loaded.language == .english)
        #expect(loaded.featuredProduct?.priceMinor == 4500)
        #expect(loaded.featuredProduct?.nameAR == "لبن كامل الدسم")
        #expect(loaded.featuredProduct?.nameEN == "Full Cream Milk")
    }

    @Test func latestValueWins() throws {
        let (store, suiteName) = try makeStore()
        defer { UserDefaults().removePersistentDomain(forName: suiteName) }

        let first = snapshot(id: "milk-full", updatedAt: Date(timeIntervalSince1970: 1_000))
        let second = snapshot(id: "yogurt-greek", updatedAt: Date(timeIntervalSince1970: 2_000))
        try store.save(WidgetSharedState(language: .english, featuredProduct: first, updatedAt: first.updatedAt))
        try store.save(WidgetSharedState(language: .arabic, featuredProduct: second, updatedAt: second.updatedAt))

        let loaded = try #require(store.load())
        #expect(loaded.featuredProduct?.id == "yogurt-greek")
        #expect(loaded.language == .arabic)
    }

    @Test func arabicAndEnglishStatesAreBothSupported() throws {
        let (store, suiteName) = try makeStore()
        defer { UserDefaults().removePersistentDomain(forName: suiteName) }

        let product = snapshot()
        try store.save(WidgetSharedState(language: .arabic, featuredProduct: product, updatedAt: product.updatedAt))
        #expect(store.load()?.featuredProduct?.name(for: .arabic) == "لبن كامل الدسم")

        try store.save(WidgetSharedState(language: .english, featuredProduct: product, updatedAt: product.updatedAt))
        #expect(store.load()?.featuredProduct?.name(for: .english) == "Full Cream Milk")
        #expect(WidgetSharedState.fallbackLanguage == .english)
    }

    @Test func corruptedDataFallsBackToThePlaceholderState() throws {
        let suiteName = "LabnaTests.WidgetSharedStore.corrupt.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suiteName))
        defer { UserDefaults().removePersistentDomain(forName: suiteName) }

        defaults.set(Data("not json".utf8), forKey: WidgetSharedDefaultsStore.stateKey)
        let store = WidgetSharedDefaultsStore(defaults: defaults)

        #expect(store.load() == nil, "Corrupt payloads must not crash or surface garbage")
    }

    @Test func stateWithoutAProductIsValidAndRendersTheFallback() throws {
        let (store, suiteName) = try makeStore()
        defer { UserDefaults().removePersistentDomain(forName: suiteName) }

        try store.save(WidgetSharedState(language: .arabic, featuredProduct: nil, updatedAt: Date()))
        let loaded = try #require(store.load())
        #expect(loaded.featuredProduct == nil)
        #expect(loaded.language == .arabic)
    }

    @Test func inMemoryStoreNeverTouchesSharedDefaults() throws {
        let store = InMemoryWidgetSharedStore()
        #expect(store.load() == nil)

        let product = snapshot()
        try store.save(WidgetSharedState(language: .english, featuredProduct: product, updatedAt: product.updatedAt))
        #expect(store.load()?.featuredProduct == product)
        #expect(store.savedState?.featuredProduct?.id == "milk-full")

        struct Boom: Error {}
        store.fail(with: Boom())
        #expect(throws: Boom.self) {
            try store.save(WidgetSharedState(language: .english, featuredProduct: nil, updatedAt: Date()))
        }
    }

    @Test func contentSignatureChangesOnlyWhenRenderedContentChanges() {
        let base = snapshot()
        #expect(base.contentSignature == snapshot().contentSignature)
        #expect(base.contentSignature != snapshot(nameEN: "Other").contentSignature)
        #expect(base.contentSignature != snapshot(priceMinor: 1).contentSignature)
    }

    @Test func imageCacheRoundTripsThroughTheGivenDirectory() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("LabnaWidgetTests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let cache = WidgetImageFileCache(directory: directory)
        let data = Data([0x01, 0x02, 0x03])
        try cache.store(data, named: "image.jpg")
        #expect(cache.data(named: "image.jpg") == data)
        #expect(cache.data(named: "missing.jpg") == nil)
    }

    @Test func imageCacheIsANoOpWithoutAContainer() {
        // An unavailable App Group must not throw; the widget simply renders its
        // branded placeholder instead.
        let cache = WidgetImageFileCache(directory: nil)
        #expect(throws: Never.self) { try cache.store(Data([0x01]), named: "image.jpg") }
        #expect(cache.data(named: "image.jpg") == nil)
    }
}

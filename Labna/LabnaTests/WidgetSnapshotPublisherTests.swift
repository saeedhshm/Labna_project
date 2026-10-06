import Foundation
import Testing
@testable import Labna

@MainActor
struct WidgetSnapshotPublisherTests {
    /// Records side effects without any global mutable state.
    private final class SideEffects: @unchecked Sendable {
        var reloadKinds: [String] = []
        var fetchedURLs: [URL] = []
    }

    private struct Harness {
        let publisher: WidgetSnapshotPublisher
        let effects: SideEffects
        let store: InMemoryWidgetSharedStore
    }

    private func makeHarness(
        imageResponse: Data? = nil,
        timestamp: Date = Date(timeIntervalSince1970: 1_700_000_000)
    ) -> Harness {
        let store = InMemoryWidgetSharedStore()
        let effects = SideEffects()
        let publisher = WidgetSnapshotPublisher(dependencies: .init(
            store: store,
            imageCache: WidgetImageFileCache(directory: nil),
            fetchImageData: { url in
                effects.fetchedURLs.append(url)
                return imageResponse
            },
            reloadTimelines: { effects.reloadKinds.append($0) },
            now: { timestamp }
        ))
        return Harness(publisher: publisher, effects: effects, store: store)
    }

    private func withoutFeatured(_ catalog: CatalogSnapshot) -> CatalogSnapshot {
        CatalogSnapshot(
            products: catalog.products.map { product in
                Product(
                    id: product.id,
                    categoryID: product.categoryID,
                    name: product.name,
                    description: product.description,
                    imageURLs: product.imageURLs,
                    ingredients: product.ingredients,
                    storageInstructions: product.storageInstructions,
                    isFeatured: false,
                    variants: product.variants
                )
            },
            categories: catalog.categories,
            banners: [],
            branches: []
        )
    }

    // MARK: - Featured selection

    @Test func featuredSelectionUsesCatalogSemanticsAndIsDeterministic() throws {
        let catalog = try CatalogFixture.snapshot()
        let first = WidgetSnapshotPublisher.featuredProduct(in: catalog.products)
        let second = WidgetSnapshotPublisher.featuredProduct(in: catalog.products)
        #expect(first?.id == "milk-full", "The catalog marks the first product as featured")
        #expect(first == second, "Selection must be stable, never random")

        let soldOut = try #require(catalog.products.first { $0.id == "cheese-roumy" })
        #expect(!soldOut.isAvailable)
        #expect(WidgetSnapshotPublisher.featuredProduct(in: [soldOut]) == nil, "Sold out is skipped")
        #expect(WidgetSnapshotPublisher.featuredProduct(in: []) == nil)
        #expect(
            WidgetSnapshotPublisher.featuredProduct(in: [catalog.products[1]]) == nil,
            "A product the catalog does not mark as featured is not eligible"
        )
    }

    @Test func snapshotSkipsProductsWithoutAnAvailablePrice() throws {
        let catalog = try CatalogFixture.snapshot()
        let soldOut = try #require(catalog.products.first { $0.id == "cheese-roumy" })
        #expect(WidgetSnapshotPublisher.snapshot(for: soldOut, imageName: nil, now: Date()) == nil)
    }

    // MARK: - Publishing

    @Test func catalogLoadPublishesTheFeaturedSnapshotAndRequestsAReload() async throws {
        let harness = makeHarness()
        let catalog = try CatalogFixture.snapshot()

        await harness.publisher.publish(snapshot: catalog, language: .english)

        let state = try #require(harness.store.load())
        #expect(state.featuredProduct?.id == "milk-full")
        #expect(state.language == .english)
        #expect(state.featuredProduct?.nameEN == "Full Cream Milk")
        #expect(state.featuredProduct?.nameAR == state.featuredProduct?.nameAR)
        #expect(state.featuredProduct?.priceMinor ?? 0 > 0)
        #expect(harness.effects.reloadKinds == [WidgetSnapshotPublisher.widgetKind])
        #expect(WidgetSnapshotPublisher.widgetKind == LabnaWidgetKind.featuredProduct)
    }

    @Test func catalogRefreshUpdatesTheSnapshot() async throws {
        let harness = makeHarness()
        let catalog = try CatalogFixture.snapshot()
        await harness.publisher.publish(snapshot: catalog, language: .english)

        let other = try #require(catalog.products.first { $0.isFeatured && $0.id != "milk-full" })
        let refreshed = CatalogSnapshot(
            products: [other] + catalog.products.filter { $0.id != other.id },
            categories: catalog.categories,
            banners: [],
            branches: []
        )
        await harness.publisher.publish(snapshot: refreshed, language: .english)

        #expect(harness.store.load()?.featuredProduct?.id == other.id)
        #expect(harness.effects.reloadKinds.count == 2)
    }

    @Test func noFeaturedProductStillPublishesAValidFallbackState() async throws {
        let harness = makeHarness()
        let catalog = try CatalogFixture.snapshot()

        await harness.publisher.publish(snapshot: withoutFeatured(catalog), language: .arabic)

        let state = try #require(harness.store.load())
        #expect(state.featuredProduct == nil)
        #expect(state.language == .arabic)
        #expect(harness.effects.reloadKinds == [WidgetSnapshotPublisher.widgetKind])
    }

    @Test func languageChangeRepublishesTheSameProductAndReloads() async throws {
        let harness = makeHarness()
        let catalog = try CatalogFixture.snapshot()
        await harness.publisher.publish(snapshot: catalog, language: .english)
        let fetchesAfterCatalogPublish = harness.effects.fetchedURLs.count

        await harness.publisher.publish(language: .arabic)

        #expect(harness.store.load()?.language == .arabic)
        #expect(harness.store.load()?.featuredProduct?.id == "milk-full", "The product is preserved")
        #expect(harness.effects.reloadKinds.count == 2, "A language change must refresh the widget")
        #expect(
            harness.effects.fetchedURLs.count == fetchesAfterCatalogPublish,
            "A language change must not refetch the image"
        )
    }

    @Test func identicalRepublishDoesNotRequestRedundantReloads() async throws {
        let harness = makeHarness()
        let catalog = try CatalogFixture.snapshot()

        await harness.publisher.publish(snapshot: catalog, language: .english)
        await harness.publisher.publish(snapshot: catalog, language: .english)
        await harness.publisher.publish(snapshot: catalog, language: .english)

        #expect(harness.effects.reloadKinds.count == 1, "Unrelated state must not churn timelines")
        #expect(harness.store.load() != nil)
    }

    @Test func aFailingStoreDoesNotCrashTheApp() async throws {
        let harness = makeHarness()
        harness.store.fail(with: StoreFailure())

        await harness.publisher.publish(snapshot: try CatalogFixture.snapshot(), language: .english)

        #expect(harness.effects.reloadKinds.isEmpty, "No reload when the data was not written")
    }

    private struct StoreFailure: Error {}
}

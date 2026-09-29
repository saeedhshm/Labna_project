import Foundation
import SwiftData
import Testing
@testable import Labna

@MainActor
@Suite(.serialized)
struct CatalogOfflineSyncTests {
    private final class MockCatalogRepository: CatalogRepository {
        var snapshot: CatalogSnapshot
        var error: CatalogError?
        var errorByResource: [CatalogResource: CatalogError] = [:]
        var delayNanoseconds: UInt64 = 0
        private(set) var productRequests = 0
        private(set) var categoryRequests = 0
        private(set) var bannerRequests = 0
        private(set) var branchRequests = 0

        init(snapshot: CatalogSnapshot, error: CatalogError? = nil) {
            self.snapshot = snapshot
            self.error = error
        }

        var totalRequests: Int { productRequests + categoryRequests + bannerRequests + branchRequests }

        func fetchProducts() async throws -> [Product] {
            productRequests += 1
            try await prepare(.products)
            return snapshot.products
        }

        func fetchCategories() async throws -> [Labna.Category] {
            categoryRequests += 1
            try await prepare(.categories)
            return snapshot.categories
        }

        func fetchBanners() async throws -> [Banner] {
            bannerRequests += 1
            try await prepare(.banners)
            return snapshot.banners
        }

        func fetchBranches() async throws -> [Branch] {
            branchRequests += 1
            try await prepare(.branches)
            return snapshot.branches
        }

        private func prepare(_ resource: CatalogResource) async throws {
            if delayNanoseconds > 0 {
                try await Task.sleep(nanoseconds: delayNanoseconds)
            }
            try Task.checkCancellation()
            if let error = errorByResource[resource] { throw error }
            if let error { throw error }
        }
    }

    private func bundledSnapshot() async throws -> CatalogSnapshot {
        let repository = JSONCatalogRepository(source: LocalJSONDataSource())
        return CatalogSnapshot(
            products: try await repository.fetchProducts(),
            categories: try await repository.fetchCategories().sorted { $0.sortOrder < $1.sortOrder },
            banners: try await repository.fetchBanners().sorted { $0.sortOrder < $1.sortOrder },
            branches: try await repository.fetchBranches()
        )
    }

    private func container(
        repository: (any CatalogRepository)? = nil,
        modelContainer: ModelContainer = PersistenceContainer.make(inMemory: true),
        cachePolicy: CatalogCachePolicy = .default,
        now: @escaping () -> Date = Date.init
    ) -> AppContainer {
        AppContainer.preview(
            language: .english,
            repository: repository,
            cachePolicy: cachePolicy,
            now: now,
            modelContainer: modelContainer
        )
    }

    @Test func emptyCacheBootstrapsBundledJSONAndPersistsIt() async throws {
        let modelContainer = PersistenceContainer.make(inMemory: true)
        let first = container(modelContainer: modelContainer)
        await first.catalog.loadIfNeeded()
        let snapshot = try loadedSnapshot(first)
        #expect(snapshot.products.count == 15)
        #expect(snapshot.categories.count == 5)

        let second = container(modelContainer: modelContainer)
        await second.catalog.loadIfNeeded()
        let restored = try loadedSnapshot(second)
        #expect(restored == snapshot)
    }

    @Test func validCachedCatalogDisplaysImmediatelyWhileRemoteRefreshRuns() async throws {
        let modelContainer = PersistenceContainer.make(inMemory: true)
        let remote = MockCatalogRepository(snapshot: renamedMilkSnapshot(try await bundledSnapshot()))
        remote.delayNanoseconds = 300_000_000
        let first = container(modelContainer: modelContainer)
        await first.catalog.loadIfNeeded()

        let second = container(repository: remote, modelContainer: modelContainer)
        await second.catalog.loadIfNeeded()
        let cached = try loadedSnapshot(second)
        #expect(cached.products.first { $0.id == "milk-full" }?.name.en == "Full Cream Milk")

        await second.catalog.reload()
        let refreshed = try loadedSnapshot(second)
        #expect(refreshed.products.first { $0.id == "milk-full" }?.name.en == "Synced Milk")
    }

    @Test func staleCacheUsesPolicyAndRefreshUpdatesLastSuccessfulSync() async throws {
        var currentDate = Date(timeIntervalSince1970: 1_000)
        let policy = CatalogCachePolicy(freshnessInterval: 10)
        let modelContainer = PersistenceContainer.make(inMemory: true)
        let remote = MockCatalogRepository(snapshot: try await bundledSnapshot())
        let first = container(repository: remote, modelContainer: modelContainer, cachePolicy: policy, now: { currentDate })
        await first.catalog.loadIfNeeded()
        await first.catalog.reload()
        guard case .available(_, .fresh(let syncDate), _) = first.catalog.state else {
            Issue.record("Expected fresh data after remote sync"); return
        }
        #expect(syncDate == currentDate)

        currentDate = Date(timeIntervalSince1970: 2_000)
        let second = container(modelContainer: modelContainer, cachePolicy: policy, now: { currentDate })
        await second.catalog.loadIfNeeded()
        guard case .available(_, .stale(let restoredDate), _) = second.catalog.state else {
            Issue.record("Expected stale cached data"); return
        }
        #expect(restoredDate == syncDate)
    }

    @Test func firstLaunchWhileOfflineStillUsesBundledCatalog() async throws {
        let remote = MockCatalogRepository(snapshot: try await bundledSnapshot(), error: .network(.notConnectedToInternet))
        let app = container(repository: remote)
        await app.catalog.loadIfNeeded()
        let snapshot = try loadedSnapshot(app)
        #expect(snapshot.products.count == 15)
    }

    @Test func cachedLaunchWhileOfflineKeepsCacheAndShowsRefreshError() async throws {
        let modelContainer = PersistenceContainer.make(inMemory: true)
        let first = container(modelContainer: modelContainer)
        await first.catalog.loadIfNeeded()
        let remote = MockCatalogRepository(snapshot: try await bundledSnapshot(), error: .network(.notConnectedToInternet))
        let second = container(repository: remote, modelContainer: modelContainer)
        await second.catalog.loadIfNeeded()
        await second.catalog.reload()
        guard case .available(let snapshot, _, .network(.notConnectedToInternet)) = second.catalog.state else {
            Issue.record("Expected cached data with offline refresh error"); return
        }
        #expect(snapshot.products.count == 15)
    }

    @Test func failedRemoteRefreshDoesNotReplaceCache() async throws {
        let modelContainer = PersistenceContainer.make(inMemory: true)
        let first = container(modelContainer: modelContainer)
        await first.catalog.loadIfNeeded()
        let before = try loadedSnapshot(first)
        let invalid = invalidRelationshipSnapshot(before)
        let remote = MockCatalogRepository(snapshot: invalid)
        let second = container(repository: remote, modelContainer: modelContainer)
        await second.catalog.loadIfNeeded()
        await second.catalog.reload()
        let after = try loadedSnapshot(second)
        #expect(after == before)
    }

    @Test func successfulRemoteSyncReplacesCache() async throws {
        let modelContainer = PersistenceContainer.make(inMemory: true)
        let remoteSnapshot = renamedMilkSnapshot(try await bundledSnapshot())
        let remote = MockCatalogRepository(snapshot: remoteSnapshot)
        let app = container(repository: remote, modelContainer: modelContainer)
        await app.catalog.loadIfNeeded()
        await app.catalog.reload()
        #expect(try loadedSnapshot(app) == remoteSnapshot)

        let restored = container(modelContainer: modelContainer)
        await restored.catalog.loadIfNeeded()
        #expect(try loadedSnapshot(restored) == remoteSnapshot)
    }

    @Test func partialEndpointFailureAndHttpFailureKeepCache() async throws {
        let modelContainer = PersistenceContainer.make(inMemory: true)
        let app = container(modelContainer: modelContainer)
        await app.catalog.loadIfNeeded()
        let cached = try loadedSnapshot(app)

        let remote = MockCatalogRepository(snapshot: renamedMilkSnapshot(cached))
        remote.errorByResource[.categories] = .httpStatus(503)
        let refreshed = container(repository: remote, modelContainer: modelContainer)
        await refreshed.catalog.loadIfNeeded()
        await refreshed.catalog.reload()
        #expect(try loadedSnapshot(refreshed) == cached)
    }

    @Test func concurrentRefreshRequestsAreCoalesced() async throws {
        let remote = MockCatalogRepository(snapshot: try await bundledSnapshot())
        remote.delayNanoseconds = 200_000_000
        let app = container(repository: remote)
        await app.catalog.loadIfNeeded()
        async let first: Void = app.catalog.reload()
        async let second: Void = app.catalog.reload()
        _ = await (first, second)
        #expect(remote.productRequests <= 2)
    }

    @Test func cancellationDuringSynchronizationKeepsUsableCache() async throws {
        let modelContainer = PersistenceContainer.make(inMemory: true)
        let app = container(modelContainer: modelContainer)
        await app.catalog.loadIfNeeded()
        let cached = try loadedSnapshot(app)

        let remote = MockCatalogRepository(snapshot: renamedMilkSnapshot(cached))
        remote.delayNanoseconds = 1_000_000_000
        let refreshing = container(repository: remote, modelContainer: modelContainer)
        await refreshing.catalog.loadIfNeeded()
        let task = Task { await refreshing.catalog.reload() }
        task.cancel()
        await task.value
        #expect(try loadedSnapshot(refreshing) == cached)
    }

    @Test func manualRefreshUsesSameSyncPipelineAndCartReconcilesAfterCatalogUpdate() async throws {
        let modelContainer = PersistenceContainer.make(inMemory: true)
        let base = try await bundledSnapshot()
        let remote = MockCatalogRepository(snapshot: unavailableMilkVariantSnapshot(base))
        let app = container(repository: remote, modelContainer: modelContainer)
        await app.catalog.loadIfNeeded()
        let product = try #require(base.products.first { $0.id == "milk-full" })
        let variant = try #require(product.variants.first { $0.id == "milk-full-250" })
        app.cart.add(product: product, variant: variant, quantity: 2)
        #expect(!app.cart.containsUnavailableItems)
        await app.catalog.reload()
        #expect(app.cart.containsUnavailableItems)
        #expect(app.cart.totalMinor == 0)
    }

    private func loadedSnapshot(_ container: AppContainer) throws -> CatalogSnapshot {
        switch container.catalog.state {
        case .available(let snapshot, _, _), .refreshing(let snapshot, _):
            return snapshot
        default:
            Issue.record("Expected available catalog")
            throw CatalogError.unexpected
        }
    }

    private func renamedMilkSnapshot(_ snapshot: CatalogSnapshot) -> CatalogSnapshot {
        replacingProduct(snapshot, id: "milk-full") { product in
            Product(
                id: product.id,
                categoryID: product.categoryID,
                name: LocalizedText(ar: "حليب متزامن", en: "Synced Milk"),
                description: product.description,
                imageURLs: product.imageURLs,
                ingredients: product.ingredients,
                storageInstructions: product.storageInstructions,
                isFeatured: product.isFeatured,
                isDemo: product.isDemo,
                variants: product.variants
            )
        }
    }

    private func invalidRelationshipSnapshot(_ snapshot: CatalogSnapshot) -> CatalogSnapshot {
        let banner = Banner(
            id: "broken-banner",
            title: LocalizedText(ar: "مكسور", en: "Broken"),
            subtitle: LocalizedText(ar: "وجهة غير صحيحة", en: "Invalid destination"),
            imageURL: snapshot.banners[0].imageURL,
            destination: Banner.Destination(kind: .product, id: "missing-product"),
            sortOrder: 999
        )
        return CatalogSnapshot(products: snapshot.products, categories: snapshot.categories, banners: [banner], branches: snapshot.branches)
    }

    private func unavailableMilkVariantSnapshot(_ snapshot: CatalogSnapshot) -> CatalogSnapshot {
        replacingProduct(snapshot, id: "milk-full") { product in
            let variants = product.variants.map { variant in
                ProductVariant(
                    id: variant.id,
                    label: variant.label,
                    quantity: variant.quantity,
                    unit: variant.unit,
                    priceMinor: variant.priceMinor,
                    currencyCode: variant.currencyCode,
                    isAvailable: variant.id == "milk-full-250" ? false : variant.isAvailable
                )
            }
            return Product(
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
    }

    private func replacingProduct(_ snapshot: CatalogSnapshot, id: String, transform: (Product) -> Product) -> CatalogSnapshot {
        CatalogSnapshot(
            products: snapshot.products.map { $0.id == id ? transform($0) : $0 },
            categories: snapshot.categories,
            banners: snapshot.banners,
            branches: snapshot.branches
        )
    }
}

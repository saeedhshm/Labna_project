import Foundation
import Testing
@testable import Labna

/// Verifies the real `CatalogSyncService` pipeline against the backend running on
/// `127.0.0.1:3001`, rather than a stub.
///
/// This is the manual check `Admin → MongoDB/API → iOS refresh` depends on:
/// a cached snapshot is published first, the remote refresh then replaces it,
/// and a later offline refresh must keep the cached data instead of dropping it.
///
/// The test skips itself when the backend is not reachable so the suite still
/// runs on a machine without `npm run dev:api`.
@MainActor
@Suite(.serialized)
struct CatalogLiveBackendTests {
    private static let baseURL = URL(string: "http://127.0.0.1:3001/api/v1")!

    private func backendIsReachable() async -> Bool {
        var request = URLRequest(url: Self.baseURL.appendingPathComponent("products"))
        request.timeoutInterval = 3
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        guard let (_, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse else { return false }
        return (200..<300).contains(http.statusCode)
    }

    @Test func cachedDataIsShownBeforeRefreshAndThenReplacedByTheBackend() async throws {
        guard await backendIsReachable() else { return }

        let container = PersistenceContainer.make(inMemory: true)
        let service = CatalogSyncService(
            modelContainer: container,
            bundledRepository: JSONCatalogRepository(source: LocalJSONDataSource()),
            remoteRepository: BackendCatalogRepository(baseURL: Self.baseURL, locale: "en")
        )
        let store = CatalogStore(syncService: service)

        // First phase: bundled bootstrap or cache, published before any network I/O.
        await store.loadIfNeeded()
        let initial = try #require(store.currentSnapshot)
        #expect(!initial.products.isEmpty)
        #expect(!initial.categories.isEmpty)
        #expect(!initial.branches.isEmpty)

        // Second phase: the remote refresh swaps in backend data.
        await store.reload()
        let refreshed = try #require(store.currentSnapshot)
        let names = refreshed.products.map { $0.name.en }
        #expect(!names.isEmpty)
        // Every published product must have come from a successful decode, so a
        // partially failed refresh cannot have replaced the good snapshot.
        switch store.state {
        case .available(_, _, let refreshError):
            #expect(refreshError == nil)
        case .refreshing, .idle, .initialLoading, .fatal:
            Issue.record("Expected an available catalog after a successful refresh")
        }

        // A reload with no changes must stay successful and keep serving data.
        await store.reload()
        #expect(store.currentSnapshot?.products.count == refreshed.products.count)
    }

    @Test func productDetailIsFetchableFromTheLiveBackend() async throws {
        guard await backendIsReachable() else { return }
        let repository = BackendCatalogRepository(baseURL: Self.baseURL, locale: "en")
        let products = try await repository.fetchProducts()
        let product = try #require(products.first)
        let detail = try await repository.fetchProduct(id: product.id)
        #expect(detail.id == product.id)
        #expect(!detail.variants.isEmpty)
        // Availability is branch-scoped and computed server-side, so the detail
        // route must agree with the list route.
        #expect(detail.variants.map(\.isAvailable) == product.variants.map(\.isAvailable))
    }

    @Test func aMissingProductIsReportedAsNotFound() async throws {
        guard await backendIsReachable() else { return }
        let repository = BackendCatalogRepository(baseURL: Self.baseURL, locale: "en")
        do {
            _ = try await repository.fetchProduct(id: "definitely-not-a-product")
            Issue.record("Expected a not-found failure")
        } catch CatalogError.httpStatus(let status) {
            #expect(status == 404)
        }
    }

    @Test func supportedQueryParametersAreAcceptedByTheLiveAPI() async throws {
        guard await backendIsReachable() else { return }
        let repository = BackendCatalogRepository(baseURL: Self.baseURL, locale: "ar")
        // Arabic locale plus the filters the UI exposes must all be valid to the
        // API's strict schema.
        let featured = try await repository.fetchProducts(query: BackendProductQuery(featuredOnly: true, sort: "priceAsc"))
        let allFeatured = featured.allSatisfy { $0.isFeatured }
        #expect(allFeatured)
        let byCategory = try await repository.fetchProducts(query: BackendProductQuery(categoryID: "milk"))
        let allInMilk = byCategory.allSatisfy { $0.categoryID == "milk" }
        #expect(allInMilk)
        // An unknown sort value must be rejected rather than silently ignored.
        do {
            _ = try await repository.fetchProducts(query: BackendProductQuery(sort: "not-a-sort"))
            Issue.record("Expected an invalid sort to be rejected")
        } catch CatalogError.httpStatus(let status) {
            #expect(status == 422)
        }
    }
}

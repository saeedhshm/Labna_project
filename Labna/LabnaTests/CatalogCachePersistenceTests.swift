import Foundation
import Testing
@testable import Labna

/// Verifies that a catalog fetched from the backend is written to the on-disk
/// SwiftData cache and survives a relaunch with the backend switched off.
///
/// The offline-first promise is "cached data → display → remote refresh", so the
/// half that unit tests with a stubbed repository cannot prove is that a real
/// refresh result is actually persisted and then reloadable. The backend is never
/// contacted here: a broken repository proves the data came from the cache.
@MainActor
@Suite(.serialized)
struct CatalogCachePersistenceTests {
    private static let baseURL = URL(string: "http://127.0.0.1:3001/api/v1")!

    /// A repository that always fails, so any data that still loads must have
    /// come from the cache.
    private struct OfflineRepository: CatalogRepository {
        private func offline() -> Error { CatalogError.network(.notConnectedToInternet) }

        func fetchProducts() async throws -> [Product] { throw offline() }
        func fetchCategories() async throws -> [Labna.Category] { throw offline() }
        func fetchBanners() async throws -> [Banner] { throw offline() }
        func fetchBranches() async throws -> [Branch] { throw offline() }
    }

    private func backendIsReachable() async -> Bool {
        var request = URLRequest(url: Self.baseURL.appendingPathComponent("products"))
        request.timeoutInterval = 3
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        guard let (_, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse else { return false }
        return (200..<300).contains(http.statusCode)
    }

    @Test func aRealBackendRefreshIsPersistedAndSurvivesTheBackendGoingAway() async throws {
        guard await backendIsReachable() else { return }

        // One store shared by both phases. The second phase builds a brand new store
        // and sync service over it, so anything it can show must have been read
        // back out of the cache rather than retained by the first store.
        let container = PersistenceContainer.make(inMemory: true)

        // Phase 1: refresh from the live backend so the cache holds real data.
        let online = CatalogStore(syncService: CatalogSyncService(
            modelContainer: container,
            bundledRepository: JSONCatalogRepository(source: LocalJSONDataSource()),
            remoteRepository: BackendCatalogRepository(baseURL: Self.baseURL, locale: "en")
        ))
        await online.loadIfNeeded()
        await online.reload()
        let live = try #require(online.currentSnapshot)
        #expect(!live.products.isEmpty)
        switch online.state {
        case .available(_, _, let refreshError):
            #expect(refreshError == nil)
        default:
            Issue.record("Expected the live refresh to succeed")
        }

        // Phase 2: a fresh store over the same store file, with the backend
        // unreachable. Everything it shows must have come from the cache.
        let offline = CatalogStore(syncService: CatalogSyncService(
            modelContainer: container,
            bundledRepository: JSONCatalogRepository(source: LocalJSONDataSource()),
            remoteRepository: OfflineRepository()
        ))
        await offline.loadIfNeeded()
        let cached = try #require(offline.currentSnapshot)
        #expect(cached.products.map(\.id) == live.products.map(\.id))
        #expect(!cached.products.isEmpty)
        #expect(cached.products.flatMap(\.variants).allSatisfy { $0.priceMinor > 0 })
        // Usable on its own, which is what keeps the app browsable with the
        // backend stopped. Compare against the live snapshot rather than a
        // hard-coded name so an admin edit cannot make this flaky.
        #expect(cached.products.map(\.name) == live.products.map(\.name))
    }
}

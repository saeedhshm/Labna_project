import Foundation
import Observation

struct CatalogSnapshot: Equatable, Hashable {
    let products: [Product]
    let categories: [Category]
    let banners: [Banner]
    let branches: [Branch]
}

@MainActor
@Observable
final class CatalogStore {
    private let syncService: CatalogSyncService
    private(set) var state: CatalogLoadState = .idle
    var onSnapshotChanged: ((CatalogSnapshot) -> Void)?
    private var backgroundRefreshTask: Task<Void, Never>?

    init(syncService: CatalogSyncService) {
        self.syncService = syncService
    }

    /// Call from a view's .task. Concurrent duplicate loads are ignored.
    func loadIfNeeded() async {
        guard case .idle = state else { return }
        await loadInitialCatalog()
    }

    /// Also used by pull-to-refresh and retry. A cancellation restores the previous state.
    func reload() async {
        await refresh(manual: true)
    }

    private func loadInitialCatalog() async {
        guard !isLoading else { return }
        let previous = state
        state = .initialLoading
        do {
            let outcome = try await syncService.loadCachedOrBootstrap()
            publish(outcome.snapshot, status: status(for: outcome), refreshError: nil)
            startBackgroundRefreshIfNeeded()
        } catch is CancellationError {
            state = previous
        } catch {
            state = .fatal(error as? CatalogError ?? .unexpected)
        }
    }

    private func refresh(manual: Bool) async {
        guard !isLoading else { return }
        guard syncService.canRefreshRemote || manual else { return }
        let previous = state
        if case .available(let snapshot, let status, _) = state {
            state = .available(snapshot, status: status, refreshError: nil)
            if manual || syncService.canRefreshRemote {
                state = .refreshing(snapshot, status: status)
            }
        } else if manual {
            state = .initialLoading
        }
        do {
            let outcome = try await syncService.refreshRemote()
            publish(outcome.snapshot, status: status(for: outcome), refreshError: nil)
        } catch is CancellationError {
            state = previous
        } catch {
            let catalogError = error as? CatalogError ?? .unexpected
            switch previous {
            case .available(let snapshot, let status, _), .refreshing(let snapshot, let status):
                state = .available(snapshot, status: status, refreshError: catalogError)
            default:
                state = .fatal(catalogError)
            }
        }
    }

    private func startBackgroundRefreshIfNeeded() {
        guard syncService.canRefreshRemote else { return }
        guard backgroundRefreshTask == nil else { return }
        backgroundRefreshTask = Task { [weak self] in
            guard let self else { return }
            await self.refresh(manual: false)
            self.backgroundRefreshTask = nil
        }
    }

    private func status(for outcome: CatalogSyncOutcome) -> CatalogDisplayStatus {
        outcome.freshness == .fresh ? .fresh(lastSuccessfulSync: outcome.lastSuccessfulSync) : .stale(lastSuccessfulSync: outcome.lastSuccessfulSync)
    }

    private func publish(_ snapshot: CatalogSnapshot, status: CatalogDisplayStatus, refreshError: CatalogError?) {
        state = .available(snapshot, status: status, refreshError: refreshError)
        onSnapshotChanged?(snapshot)
    }

    private var isLoading: Bool {
        if case .initialLoading = state { return true }
        if case .refreshing = state { return true }
        return false
    }
}

enum CatalogDisplayStatus: Equatable {
    case cached(lastSuccessfulSync: Date?)
    case fresh(lastSuccessfulSync: Date?)
    case stale(lastSuccessfulSync: Date?)
}

enum CatalogLoadState: Equatable {
    case idle
    case initialLoading
    case available(CatalogSnapshot, status: CatalogDisplayStatus, refreshError: CatalogError?)
    case refreshing(CatalogSnapshot, status: CatalogDisplayStatus)
    case fatal(CatalogError)
}

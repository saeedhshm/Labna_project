import Foundation
import Observation

struct CatalogSnapshot {
    let products: [Product]
    let categories: [Category]
    let banners: [Banner]
    let branches: [Branch]
}

@MainActor
@Observable
final class CatalogStore {
    private let repository: any CatalogRepository
    private(set) var state: LoadState<CatalogSnapshot> = .idle

    init(repository: any CatalogRepository) {
        self.repository = repository
    }

    /// Call from a view's .task. Concurrent duplicate loads are ignored.
    func loadIfNeeded() async {
        guard case .idle = state else { return }
        await reload()
    }

    /// Also used by the retry button. A cancellation restores the previous state.
    func reload() async {
        guard !isLoading else { return }
        let previous = state
        state = .loading
        do {
            let products = try await repository.fetchProducts()
            let categories = try await repository.fetchCategories()
            let banners = try await repository.fetchBanners()
            let branches = try await repository.fetchBranches()
            try Task.checkCancellation()
            state = .loaded(CatalogSnapshot(
                products: products,
                categories: categories.sorted { $0.sortOrder < $1.sortOrder },
                banners: banners.sorted { $0.sortOrder < $1.sortOrder },
                branches: branches
            ))
        } catch is CancellationError {
            state = previous
        } catch {
            state = .failed(error as? CatalogError ?? .unexpected)
        }
    }

    private var isLoading: Bool {
        if case .loading = state { return true }
        return false
    }
}

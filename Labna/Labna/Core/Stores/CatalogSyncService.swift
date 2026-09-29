import Foundation
import SwiftData

struct CatalogCachePolicy: Equatable {
    let freshnessInterval: TimeInterval

    func freshness(lastSuccessfulSync: Date?, now: Date) -> CatalogFreshness {
        guard let lastSuccessfulSync else { return .stale }
        return now.timeIntervalSince(lastSuccessfulSync) <= freshnessInterval ? .fresh : .stale
    }

    nonisolated static let `default` = CatalogCachePolicy(freshnessInterval: 60 * 60)
}

enum CatalogFreshness: Equatable {
    case fresh
    case stale
}

struct CatalogSyncOutcome: Equatable {
    let snapshot: CatalogSnapshot
    let freshness: CatalogFreshness
    let lastSuccessfulSync: Date?
}

@MainActor
final class CatalogSyncService {
    private let cache: CatalogCacheStore
    private let bundledRepository: any CatalogRepository
    private let remoteRepository: (any CatalogRepository)?
    private let cachePolicy: CatalogCachePolicy
    private let now: () -> Date
    private var refreshTask: Task<CatalogSyncOutcome, Error>?

    var canRefreshRemote: Bool { remoteRepository != nil }

    init(
        modelContainer: ModelContainer,
        bundledRepository: any CatalogRepository,
        remoteRepository: (any CatalogRepository)?,
        cachePolicy: CatalogCachePolicy = .default,
        now: @escaping () -> Date = Date.init
    ) {
        cache = CatalogCacheStore(modelContainer: modelContainer)
        self.bundledRepository = bundledRepository
        self.remoteRepository = remoteRepository
        self.cachePolicy = cachePolicy
        self.now = now
    }

    func loadCachedOrBootstrap() async throws -> CatalogSyncOutcome {
        if let cached = try cache.load() {
            return outcome(snapshot: cached.snapshot, lastSuccessfulSync: cached.lastSuccessfulSync)
        }
        let snapshot = try await fetchCompleteCatalog(from: bundledRepository)
        try CatalogValidator.validate(snapshot)
        try cache.replace(with: snapshot, lastSuccessfulSync: nil)
        return outcome(snapshot: snapshot, lastSuccessfulSync: nil)
    }

    func refreshRemote() async throws -> CatalogSyncOutcome {
        guard let remoteRepository else {
            if let cached = try cache.load() {
                return outcome(snapshot: cached.snapshot, lastSuccessfulSync: cached.lastSuccessfulSync)
            }
            return try await loadCachedOrBootstrap()
        }
        if let refreshTask {
            return try await refreshTask.value
        }
        let task = Task { @MainActor in
            let snapshot = try await fetchCompleteCatalog(from: remoteRepository)
            try CatalogValidator.validate(snapshot)
            let syncDate = now()
            try cache.replace(with: snapshot, lastSuccessfulSync: syncDate)
            return outcome(snapshot: snapshot, lastSuccessfulSync: syncDate)
        }
        refreshTask = task
        defer { refreshTask = nil }
        return try await task.value
    }

    private func outcome(snapshot: CatalogSnapshot, lastSuccessfulSync: Date?) -> CatalogSyncOutcome {
        CatalogSyncOutcome(
            snapshot: snapshot,
            freshness: cachePolicy.freshness(lastSuccessfulSync: lastSuccessfulSync, now: now()),
            lastSuccessfulSync: lastSuccessfulSync
        )
    }

    private func fetchCompleteCatalog(from repository: any CatalogRepository) async throws -> CatalogSnapshot {
        let products = try await repository.fetchProducts()
        let categories = try await repository.fetchCategories()
        let banners = try await repository.fetchBanners()
        let branches = try await repository.fetchBranches()
        try Task.checkCancellation()
        return CatalogSnapshot(
            products: products,
            categories: categories.sorted { $0.sortOrder < $1.sortOrder },
            banners: banners.sorted { $0.sortOrder < $1.sortOrder },
            branches: branches
        )
    }
}

@MainActor
private final class CatalogCacheStore {
    private let context: ModelContext

    init(modelContainer: ModelContainer) {
        context = ModelContext(modelContainer)
    }

    func load() throws -> (snapshot: CatalogSnapshot, lastSuccessfulSync: Date?)? {
        let products = try context.fetch(FetchDescriptor<PersistedCatalogProduct>(sortBy: [SortDescriptor(\.cacheOrder)]))
        guard !products.isEmpty else { return nil }
        let variants = try context.fetch(FetchDescriptor<PersistedCatalogVariant>(sortBy: [SortDescriptor(\.cacheOrder)]))
        let categories = try context.fetch(FetchDescriptor<PersistedCatalogCategory>(sortBy: [SortDescriptor(\.cacheOrder)]))
        let banners = try context.fetch(FetchDescriptor<PersistedCatalogBanner>(sortBy: [SortDescriptor(\.cacheOrder)]))
        let branches = try context.fetch(FetchDescriptor<PersistedCatalogBranch>(sortBy: [SortDescriptor(\.cacheOrder)]))
        let metadata = try context.fetch(FetchDescriptor<PersistedCatalogMetadata>()).first

        let variantsByProductID = Dictionary(grouping: variants.compactMap { model -> (String, ProductVariant)? in
            guard let variant = model.domain else { return nil }
            return (model.productID, variant)
        }, by: \.0).mapValues { $0.map(\.1) }

        let snapshot = try CatalogSnapshot(
            products: products.map { try $0.domain(variants: variantsByProductID[$0.id, default: []]) },
            categories: categories.compactMap(\.domain).sorted { $0.sortOrder < $1.sortOrder },
            banners: banners.compactMap(\.domain).sorted { $0.sortOrder < $1.sortOrder },
            branches: branches.compactMap(\.domain)
        )
        try CatalogValidator.validate(snapshot)
        return (snapshot, metadata?.lastSuccessfulSync)
    }

    func replace(with snapshot: CatalogSnapshot, lastSuccessfulSync: Date?) throws {
        let context = ModelContext(context.container)
        try deleteAll(PersistedCatalogProduct.self, in: context)
        try deleteAll(PersistedCatalogVariant.self, in: context)
        try deleteAll(PersistedCatalogCategory.self, in: context)
        try deleteAll(PersistedCatalogBanner.self, in: context)
        try deleteAll(PersistedCatalogBranch.self, in: context)
        try deleteAll(PersistedCatalogMetadata.self, in: context)

        for (productIndex, product) in snapshot.products.enumerated() {
            context.insert(PersistedCatalogProduct(product, cacheOrder: productIndex))
            for (variantIndex, variant) in product.variants.enumerated() {
                context.insert(PersistedCatalogVariant(productID: product.id, variant: variant, cacheOrder: variantIndex))
            }
        }
        for (index, category) in snapshot.categories.enumerated() { context.insert(PersistedCatalogCategory(category, cacheOrder: index)) }
        for (index, banner) in snapshot.banners.enumerated() { context.insert(PersistedCatalogBanner(banner, cacheOrder: index)) }
        for (index, branch) in snapshot.branches.enumerated() { context.insert(try PersistedCatalogBranch(branch, cacheOrder: index)) }
        context.insert(PersistedCatalogMetadata(lastSuccessfulSync: lastSuccessfulSync))
        try context.save()
    }

    private func deleteAll<T: PersistentModel>(_ type: T.Type, in context: ModelContext) throws {
        try context.fetch(FetchDescriptor<T>()).forEach { context.delete($0) }
    }
}

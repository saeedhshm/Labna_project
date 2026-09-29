import Foundation
import Observation
import SwiftData

@Observable
final class AppContainer {
    let settings: AppSettings
    let configuration: AppConfiguration
    let catalogRepository: any CatalogRepository
    let catalogSync: CatalogSyncService
    let backgroundSync: CatalogBackgroundSync
    let catalog: CatalogStore
    let cart: CartStore
    let favorites: FavoritesStore
    let modelContainer: ModelContainer
    let router: AppRouter

    init(
        settings: AppSettings = AppSettings(),
        configuration: AppConfiguration = .mock,
        repository: (any CatalogRepository)? = nil,
        cachePolicy: CatalogCachePolicy = .default,
        now: @escaping () -> Date = Date.init,
        modelContainer: ModelContainer? = nil
    ) {
        self.settings = settings
        self.configuration = configuration
        let selectedContainer = modelContainer ?? PersistenceContainer.make()
        self.modelContainer = selectedContainer
        let bundledRepository: any CatalogRepository = JSONCatalogRepository(source: LocalJSONDataSource())
        let remoteRepository: (any CatalogRepository)?
        if let repository {
            remoteRepository = repository
        } else {
            switch configuration.dataSource {
            case .localJSON:
                remoteRepository = nil
            case .remote(let baseURL):
                remoteRepository = JSONCatalogRepository(source: RemoteCatalogDataSource(baseURL: baseURL))
            }
        }
        catalogRepository = remoteRepository ?? bundledRepository
        catalogSync = CatalogSyncService(
            modelContainer: selectedContainer,
            bundledRepository: bundledRepository,
            remoteRepository: remoteRepository,
            cachePolicy: cachePolicy,
            now: now
        )
        backgroundSync = CatalogBackgroundSync(syncService: catalogSync)
        catalog = CatalogStore(syncService: catalogSync)
        cart = CartStore(modelContainer: selectedContainer)
        favorites = FavoritesStore(modelContainer: selectedContainer)
        catalog.onSnapshotChanged = { [cart] snapshot in
            cart.review(using: snapshot.products)
        }
        router = AppRouter()
    }

    static func preview(
        language: AppLanguage,
        repository: (any CatalogRepository)? = nil,
        cachePolicy: CatalogCachePolicy = .default,
        now: @escaping () -> Date = Date.init,
        modelContainer: ModelContainer = PersistenceContainer.make(inMemory: true)
    ) -> AppContainer {
        let settings = AppSettings(storage: nil)
        settings.language = language
        return AppContainer(
            settings: settings,
            repository: repository,
            cachePolicy: cachePolicy,
            now: now,
            modelContainer: modelContainer
        )
    }
}

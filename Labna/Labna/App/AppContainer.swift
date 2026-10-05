import Foundation
import Nuke
import Observation
import SwiftData
import WidgetKit

@Observable
final class AppContainer {
    let settings: AppSettings
    let configuration: AppConfiguration
    let catalogRepository: any CatalogRepository
    let catalogSync: CatalogSyncService
    let backgroundSync: CatalogBackgroundSync
    let catalog: CatalogStore
    let cart: CartStore
    let cartValidation: CartValidationStore
    let favorites: FavoritesStore
    let recentlyViewed: RecentlyViewedStore
    let auth: AuthStore
    let addresses: AddressesStore
    let modelContainer: ModelContainer
    let router: AppRouter
    let deepLinks: DeepLinkCoordinator
    let widgetPublisher: WidgetSnapshotPublisher

    init(
        settings: AppSettings = AppSettings(),
        configuration: AppConfiguration = .backend,
        repository: (any CatalogRepository)? = nil,
        cachePolicy: CatalogCachePolicy = .default,
        now: @escaping () -> Date = Date.init,
        modelContainer: ModelContainer? = nil,
        widgetPublisher: WidgetSnapshotPublisher? = nil,
        authService: AuthService? = nil
    ) {
        self.settings = settings
        self.configuration = configuration
        let selectedContainer = modelContainer ?? PersistenceContainer.make()
        self.modelContainer = selectedContainer
        // The bundled-only preview configuration still needs a real API URL for
        // cart validation and auth, so it always falls back to the backend base URL.
        let apiBaseURL: URL = switch configuration.dataSource {
        case .localJSON: AppConfiguration.backendAPIBaseURL
        case .remote(let baseURL): baseURL
        }
        let bundledRepository: any CatalogRepository = JSONCatalogRepository(source: LocalJSONDataSource())
        let remoteRepository: (any CatalogRepository)?
        if let repository {
            remoteRepository = repository
        } else {
            switch configuration.dataSource {
            case .localJSON:
                remoteRepository = nil
            case .remote(let baseURL):
                remoteRepository = BackendCatalogRepository(baseURL: baseURL)
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
        // Checkout readiness always comes from the backend, never from the
        // locally cached catalog, so it shares the resolved API base URL.
        cartValidation = CartValidationStore(service: CartValidationService(baseURL: apiBaseURL), cart: cart)
        favorites = FavoritesStore(modelContainer: selectedContainer)
        recentlyViewed = RecentlyViewedStore(modelContainer: selectedContainer)
        let authBaseURL: URL = apiBaseURL
        let resolvedAuthService = authService ?? AuthService(baseURL: authBaseURL)
        let authStore = AuthStore(service: resolvedAuthService)
        auth = authStore
        // Shares the session actor so address calls refresh the same token.
        addresses = AddressesStore(service: resolvedAuthService, auth: authStore)
        router = AppRouter()
        deepLinks = DeepLinkCoordinator(router: router)
        let publisher = widgetPublisher ?? WidgetSnapshotPublisher(
            dependencies: .init(
                store: WidgetSharedDefaultsStore(),
                imageCache: WidgetImageFileCache(),
                fetchImageData: Self.fetchWidgetImage,
                reloadTimelines: { kind in WidgetCenter.shared.reloadTimelines(ofKind: kind) },
                now: now
            )
        )
        self.widgetPublisher = publisher

        // Single place where the catalog publish fans out: the cart reconciles
        // prices and the widget snapshot is refreshed.
        let settings = self.settings
        catalog.onSnapshotChanged = { [cart, weak publisher, settings] snapshot in
            cart.review(using: snapshot.products)
            guard let publisher else { return }
            let language = settings.language
            Task { @MainActor in
                await publisher.publish(snapshot: snapshot, language: language)
            }
        }
        settings.onLanguageChange = { [weak publisher] language in
            guard let publisher else { return }
            Task { @MainActor in
                await publisher.publish(language: language)
            }
        }
    }

    static func preview(
        language: AppLanguage,
        repository: (any CatalogRepository)? = nil,
        cachePolicy: CatalogCachePolicy = .default,
        now: @escaping () -> Date = Date.init,
        modelContainer: ModelContainer = PersistenceContainer.make(inMemory: true),
        authService: AuthService? = nil
    ) -> AppContainer {
        let settings = AppSettings(storage: nil)
        settings.language = language
        return AppContainer(
            settings: settings,
            configuration: .mock,
            repository: repository,
            cachePolicy: cachePolicy,
            now: now,
            modelContainer: modelContainer,
            authService: authService
        )
    }

    /// Downloads the featured product image for the widget cache using the same
    /// pipeline the app already uses, keeping the widget offline-capable.
    private static func fetchWidgetImage(_ url: URL) async -> Data? {
        await withCheckedContinuation { continuation in
            let task = ImagePipeline.shared.loadImage(with: url) { result in
                guard case .success(let response) = result else {
                    continuation.resume(returning: nil)
                    return
                }
                continuation.resume(returning: response.container.data)
            }
            _ = task
        }
    }
}

import Observation
import SwiftData

@Observable
final class AppContainer {
    let settings: AppSettings
    let configuration: AppConfiguration
    let catalogRepository: any CatalogRepository
    let catalog: CatalogStore
    let cart: CartStore
    let modelContainer: ModelContainer
    let router: AppRouter

    init(
        settings: AppSettings = AppSettings(),
        configuration: AppConfiguration = .mock,
        repository: (any CatalogRepository)? = nil,
        modelContainer: ModelContainer? = nil
    ) {
        self.settings = settings
        self.configuration = configuration
        let selectedRepository: any CatalogRepository
        if let repository {
            selectedRepository = repository
        } else {
            switch configuration.dataSource {
            case .localJSON:
                selectedRepository = JSONCatalogRepository(source: LocalJSONDataSource())
            case .remote(let baseURL):
                selectedRepository = JSONCatalogRepository(source: RemoteCatalogDataSource(baseURL: baseURL))
            }
        }
        catalogRepository = selectedRepository
        catalog = CatalogStore(repository: selectedRepository)
        let selectedContainer = modelContainer ?? PersistenceContainer.make()
        self.modelContainer = selectedContainer
        cart = CartStore(modelContainer: selectedContainer)
        router = AppRouter()
    }

    static func preview(language: AppLanguage) -> AppContainer {
        let settings = AppSettings(storage: nil)
        settings.language = language
        return AppContainer(settings: settings, modelContainer: PersistenceContainer.make(inMemory: true))
    }
}

import SwiftData

enum PersistenceContainer {
    static func make(inMemory: Bool = false) -> ModelContainer {
        let configuration = ModelConfiguration(isStoredInMemoryOnly: inMemory)
        do {
            return try ModelContainer(
                for: PersistedCartItem.self,
                PersistedCatalogProduct.self,
                PersistedCatalogVariant.self,
                PersistedCatalogCategory.self,
                PersistedCatalogBanner.self,
                PersistedCatalogBranch.self,
                PersistedCatalogMetadata.self,
                PersistedFavorite.self,
                PersistedRecentlyViewed.self,
                configurations: configuration
            )
        } catch {
            fatalError("Unable to create the cart store: \(error)")
        }
    }
}

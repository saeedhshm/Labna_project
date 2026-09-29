import Foundation
import SwiftData

enum PersistenceContainer {
    /// The app's SwiftData store always stays in the app's private container.
    ///
    /// Without an explicit URL, SwiftData relocates its default store into the
    /// first App Group container once the App Group entitlement is present. That
    /// would silently move the private store into a container the widget
    /// extension can also reach, so the location is pinned here on purpose and
    /// the App Group is used only for the widget payload.
    static func make(inMemory: Bool = false) -> ModelContainer {
        let configuration: ModelConfiguration
        if inMemory {
            configuration = ModelConfiguration(isStoredInMemoryOnly: true)
        } else if let storeURL = privateStoreURL() {
            configuration = ModelConfiguration(url: storeURL)
        } else {
            configuration = ModelConfiguration()
        }
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

    /// `<AppDataContainer>/Library/Application Support/Default.store`.
    ///
    /// Derived from the documents directory, which always resolves to the app's
    /// own container even when the app belongs to an App Group.
    static func privateStoreURL(fileManager: FileManager = .default) -> URL? {
        guard let documents = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else {
            return nil
        }
        return documents
            .deletingLastPathComponent()
            .appendingPathComponent("Library/Application Support", isDirectory: true)
            .appendingPathComponent("Default.store")
    }
}

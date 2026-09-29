import Foundation
import Observation
import SwiftData

@MainActor
@Observable
final class FavoritesStore {
    private let context: ModelContext
    private(set) var favoriteProductIDs: [String] = []
    private(set) var persistenceFailed = false
    private var favoriteSet = Set<String>()

    init(modelContainer: ModelContainer) {
        context = ModelContext(modelContainer)
        restore()
    }

    func isFavorite(productID: String) -> Bool {
        favoriteSet.contains(productID)
    }

    func addFavorite(productID: String) {
        guard !productID.isEmpty, favoriteSet.insert(productID).inserted else { return }
        favoriteProductIDs.append(productID)
        persist()
    }

    func removeFavorite(productID: String) {
        guard favoriteSet.remove(productID) != nil else { return }
        favoriteProductIDs.removeAll { $0 == productID }
        persist()
    }

    func toggleFavorite(productID: String) {
        if isFavorite(productID: productID) {
            removeFavorite(productID: productID)
        } else {
            addFavorite(productID: productID)
        }
    }

    func removeAll() {
        favoriteProductIDs = []
        favoriteSet = []
        persist()
    }

    private func restore() {
        do {
            let descriptor = FetchDescriptor<PersistedFavorite>(sortBy: [SortDescriptor(\.createdAt)])
            let restored = try context.fetch(descriptor).map(\.productID).filter { !$0.isEmpty }
            favoriteProductIDs = restored.reduce(into: []) { result, productID in
                if !result.contains(productID) {
                    result.append(productID)
                }
            }
            favoriteSet = Set(favoriteProductIDs)
            persistenceFailed = false
        } catch {
            favoriteProductIDs = []
            favoriteSet = []
            persistenceFailed = true
        }
    }

    private func persist() {
        do {
            let stored = try context.fetch(FetchDescriptor<PersistedFavorite>())
            let storedByID = Dictionary(uniqueKeysWithValues: stored.map { ($0.productID, $0) })
            for model in stored where !favoriteSet.contains(model.productID) {
                context.delete(model)
            }
            let currentIDs = Set(storedByID.keys)
            for id in favoriteProductIDs where !currentIDs.contains(id) {
                context.insert(PersistedFavorite(productID: id))
            }
            try context.save()
            persistenceFailed = false
        } catch {
            persistenceFailed = true
        }
    }
}

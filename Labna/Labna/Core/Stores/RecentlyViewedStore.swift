import Foundation
import Observation
import SwiftData

@MainActor
@Observable
final class RecentlyViewedStore {
    private let context: ModelContext
    private let limit: Int
    private(set) var productIDs: [String] = []
    private(set) var persistenceFailed = false

    init(modelContainer: ModelContainer, limit: Int = 20) {
        context = ModelContext(modelContainer)
        self.limit = limit
        restore()
    }

    func record(productID: String, viewedAt: Date = .now) {
        guard !productID.isEmpty else { return }
        productIDs.removeAll { $0 == productID }
        productIDs.insert(productID, at: 0)
        if productIDs.count > limit {
            productIDs = Array(productIDs.prefix(limit))
        }
        persist(productID: productID, viewedAt: viewedAt)
    }

    func removeAll() {
        productIDs = []
        do {
            let stored = try context.fetch(FetchDescriptor<PersistedRecentlyViewed>())
            for model in stored {
                context.delete(model)
            }
            try context.save()
            persistenceFailed = false
        } catch {
            persistenceFailed = true
        }
    }

    private func restore() {
        do {
            var descriptor = FetchDescriptor<PersistedRecentlyViewed>(sortBy: [SortDescriptor(\.viewedAt, order: .reverse)])
            descriptor.fetchLimit = limit
            let restored = try context.fetch(descriptor).map(\.productID).filter { !$0.isEmpty }
            productIDs = restored.reduce(into: []) { result, productID in
                if !result.contains(productID) {
                    result.append(productID)
                }
            }
            persistenceFailed = false
            pruneToLimit()
        } catch {
            productIDs = []
            persistenceFailed = true
        }
    }

    private func persist(productID: String, viewedAt: Date) {
        do {
            let descriptor = FetchDescriptor<PersistedRecentlyViewed>(predicate: #Predicate { $0.productID == productID })
            if let existing = try context.fetch(descriptor).first {
                existing.viewedAt = viewedAt
            } else {
                context.insert(PersistedRecentlyViewed(productID: productID, viewedAt: viewedAt))
            }
            try context.save()
            persistenceFailed = false
            pruneToLimit()
        } catch {
            persistenceFailed = true
        }
    }

    private func pruneToLimit() {
        do {
            let descriptor = FetchDescriptor<PersistedRecentlyViewed>(sortBy: [SortDescriptor(\.viewedAt, order: .reverse)])
            let stored = try context.fetch(descriptor)
            for model in stored.dropFirst(limit) {
                context.delete(model)
            }
            if context.hasChanges {
                try context.save()
            }
        } catch {
            persistenceFailed = true
        }
    }
}

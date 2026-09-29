import Foundation
import SwiftData

@Model
final class PersistedFavorite {
    @Attribute(.unique) var productID: String
    var createdAt: Date

    init(productID: String, createdAt: Date = .now) {
        self.productID = productID
        self.createdAt = createdAt
    }
}

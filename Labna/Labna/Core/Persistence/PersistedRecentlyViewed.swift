import Foundation
import SwiftData

@Model
final class PersistedRecentlyViewed {
    @Attribute(.unique) var productID: String
    var viewedAt: Date

    init(productID: String, viewedAt: Date = .now) {
        self.productID = productID
        self.viewedAt = viewedAt
    }
}

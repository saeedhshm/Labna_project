import Foundation

/// Single place where Labna URLs are created.
///
/// Deep links are produced by widgets, notifications and share sheets, so
/// string concatenation is never done at the call sites.
enum DeepLinkURLBuilder {
    nonisolated static let scheme = "labna"

    nonisolated static func url(for deepLink: DeepLink) -> URL? {
        switch deepLink {
        case .product(let id):
            return url(host: "product", identifier: id)
        case .category(let id):
            return url(host: "category", identifier: id)
        case .favorites:
            return url(host: "favorites")
        case .recentlyViewed:
            return url(host: "recently-viewed")
        case .cart:
            return url(host: "cart")
        case .branches:
            return url(host: "branches")
        }
    }

    nonisolated static func url(host: String, identifier: String? = nil) -> URL? {
        var components = URLComponents()
        components.scheme = scheme
        components.host = host
        if let identifier {
            let trimmed = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return nil }
            components.path = "/\(trimmed)"
        }
        return components.url
    }
}

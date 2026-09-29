import Foundation

/// A resolved, strongly typed in-app destination.
///
/// Raw URLs never reach navigation code: they are converted into a `DeepLink`
/// by `DeepLinkParsing` first, and only then handled by the app router.
/// This keeps the surface small enough to be extended by push notifications,
/// universal links and sharing without touching feature screens.
nonisolated enum DeepLink: Equatable, Hashable, Sendable {
    case product(id: String)
    case category(id: String)
    case favorites
    case recentlyViewed
    case cart
    case branches
}

/// Why a deep link could not be turned into navigation.
nonisolated enum DeepLinkRejection: Equatable, Hashable, Sendable {
    /// The URL did not match any known route.
    case unsupportedURL
    /// The route is known but its identifier is missing or empty.
    case missingIdentifier
    /// The identifier is well formed but no longer exists in the catalog.
    case unknownProduct
    /// The identifier is well formed but no longer exists in the catalog.
    case unknownCategory
    /// The catalog could not be loaded, so the destination cannot be resolved.
    case catalogUnavailable
}

/// Result of handing a deep link to the router. Navigation code can use this
/// for diagnostics and tests; the app itself simply ignores unhandled links.
nonisolated enum DeepLinkOutcome: Equatable, Hashable, Sendable {
    case handled
    case rejected(DeepLinkRejection)
}

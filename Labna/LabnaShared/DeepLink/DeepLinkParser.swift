import Foundation

/// Turns an external `URL` into a `DeepLink`.
///
/// Parsing is deliberately free of navigation and catalog knowledge so the
/// same implementation can be reused by widgets, notifications and future
/// universal links, and so it can be exhaustively unit tested.
nonisolated protocol DeepLinkParsing: Sendable {
    /// Returns `nil` for any URL that is not a supported Labna route.
    func parse(_ url: URL) -> DeepLink?

    /// Convenience for callers that receive unvalidated strings.
    func parse(_ string: String) -> DeepLink?
}

extension DeepLinkParsing {
    nonisolated func parse(_ string: String) -> DeepLink? {
        guard let url = URL(string: string) else { return nil }
        return parse(url)
    }
}

/// A single matchable route.
///
/// `pathPrefix` lists the leading path components that identify the route so
/// the same type can describe both custom scheme URLs (`labna://product/1`,
/// prefix `[]`) and future universal links
/// (`https://<domain>/products/1`, prefix `["products"]`).
nonisolated struct DeepLinkRoute: Sendable {
    let host: String
    let pathPrefix: [String]
    let requiresIdentifier: Bool
    let make: @Sendable (String?) -> DeepLink?

    nonisolated init(
        host: String,
        pathPrefix: [String] = [],
        requiresIdentifier: Bool = false,
        make: @escaping @Sendable (String?) -> DeepLink?
    ) {
        self.host = host
        self.pathPrefix = pathPrefix
        self.requiresIdentifier = requiresIdentifier
        self.make = make
    }
}

/// Default parser for the `labna://` custom scheme.
///
/// Routes are data driven, so adding a destination means appending one entry
/// to `schemeRoutes` (and, later, a `webRoute` once a real domain exists).
/// No navigation code changes are required.
nonisolated struct DeepLinkParser: DeepLinkParsing {
    let schemeRoutes: [DeepLinkRoute]
    let webRoutes: [DeepLinkRoute]

    nonisolated init(
        scheme: String = DeepLinkURLBuilder.scheme,
        schemeRoutes: [DeepLinkRoute]? = nil,
        webRoutes: [DeepLinkRoute] = []
    ) {
        self.schemeRoutes = schemeRoutes ?? Self.labnaRoutes(for: scheme)
        self.webRoutes = webRoutes
    }

    nonisolated func parse(_ url: URL) -> DeepLink? {
        guard let scheme = url.scheme?.lowercased(), let host = url.host?.lowercased() else {
            return nil
        }
        let components = Self.pathComponents(of: url)

        switch scheme {
        case DeepLinkURLBuilder.scheme.lowercased():
            return match(routes: schemeRoutes, host: host, path: components)
        case "http", "https":
            // Reserved for Universal Links. Empty until the project owns a domain,
            // at which point only this list needs to grow.
            return match(routes: webRoutes, host: host, path: components)
        default:
            return nil
        }
    }

    private nonisolated func match(routes: [DeepLinkRoute], host: String, path: [String]) -> DeepLink? {
        for route in routes where route.host.lowercased() == host {
            guard path.count >= route.pathPrefix.count else { continue }
            let prefix = path.prefix(route.pathPrefix.count).map { $0.lowercased() }
            guard prefix.elementsEqual(route.pathPrefix) else { continue }

            if route.requiresIdentifier {
                guard path.count == route.pathPrefix.count + 1 else { continue }
                let identifier = path[route.pathPrefix.count].trimmedIdentifier
                guard !identifier.isEmpty else { return nil }
                return route.make(identifier)
            }

            guard path.count == route.pathPrefix.count else { continue }
            return route.make(nil)
        }
        return nil
    }

    /// Percent-decoded, empty-free path components. A component that contains a
    /// `%` but cannot be decoded is treated as malformed, so a broken escape
    /// never becomes a bogus identifier.
    private nonisolated static func pathComponents(of url: URL) -> [String] {
        url.path
            .split(separator: "/", omittingEmptySubsequences: true)
            .compactMap { substring in
                let raw = String(substring)
                guard raw.contains("%") else { return raw }
                return raw.removingPercentEncoding
            }
    }

    private nonisolated static func labnaRoutes(for scheme: String) -> [DeepLinkRoute] {
        [
            DeepLinkRoute(
                host: "product",
                requiresIdentifier: true,
                make: { $0.map(DeepLink.product(id:)) }
            ),
            DeepLinkRoute(
                host: "category",
                requiresIdentifier: true,
                make: { $0.map(DeepLink.category(id:)) }
            ),
            DeepLinkRoute(host: "favorites", make: { _ in .favorites }),
            DeepLinkRoute(host: "recently-viewed", make: { _ in .recentlyViewed }),
            DeepLinkRoute(host: "cart", make: { _ in .cart }),
            DeepLinkRoute(host: "branches", make: { _ in .branches }),
            DeepLinkRoute(host: "orders", make: { _ in .orders }),
            // An order can be addressed by its internal id or its `LBN-…`
            // number, which is what the API accepts.
            DeepLinkRoute(
                host: "order",
                requiresIdentifier: true,
                make: { $0.map(DeepLink.order(id:)) }
            ),
        ]
    }
}

private extension String {
    nonisolated var trimmedIdentifier: String {
        trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

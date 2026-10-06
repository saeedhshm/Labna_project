import Foundation
import Observation

/// Whether the catalog can answer deep link questions yet.
enum CatalogReadiness: Equatable {
    case loading
    case ready(CatalogSnapshot)
    case unavailable

    var resolver: (any DeepLinkResolving)? {
        if case .ready(let snapshot) = self { return snapshot }
        return nil
    }
}

/// Single entry point for every inbound link: widgets, `openURL`, future push
/// notifications and future universal links.
///
/// On a cold launch the URL arrives before the catalog exists, so the link is
/// held as `pending` and replayed from application state once the catalog
/// becomes ready. No timers and no arbitrary delays are involved, and a handled
/// link is always cleared so it can never run twice.
@MainActor
@Observable
final class DeepLinkCoordinator {
    private let parser: any DeepLinkParsing
    private let router: AppRouter
    private(set) var pending: DeepLink?
    private(set) var readiness: CatalogReadiness = .loading
    /// Last outcome, exposed for diagnostics and tests.
    private(set) var lastOutcome: DeepLinkOutcome?

    init(parser: any DeepLinkParsing = DeepLinkParser(), router: AppRouter) {
        self.parser = parser
        self.router = router
    }

    /// Handles an inbound URL. Unsupported URLs are ignored, never guessed.
    func open(_ url: URL) {
        guard let deepLink = parser.parse(url) else {
            lastOutcome = .rejected(.unsupportedURL)
            return
        }
        open(deepLink)
    }

    func open(_ deepLink: DeepLink) {
        guard deepLink.requiresCatalog else {
            lastOutcome = router.handle(deepLink, catalog: nil)
            return
        }
        // Overwrites any earlier pending link: only the most recent request matters.
        pending = deepLink
        flush()
    }

    /// Reports catalog progress. Safe to call repeatedly; the pending link is
    /// consumed exactly once.
    func update(readiness: CatalogReadiness) {
        self.readiness = readiness
        flush()
    }

    /// Runs the pending link if the catalog can resolve it. Returns `true` when
    /// a link was handled, which makes the once-only behaviour testable.
    @discardableResult
    func flush() -> Bool {
        guard let deepLink = pending else { return false }
        switch readiness {
        case .loading:
            return false
        case .unavailable:
            pending = nil
            lastOutcome = .rejected(.catalogUnavailable)
            return true
        case .ready(let snapshot):
            pending = nil
            lastOutcome = router.handle(deepLink, catalog: snapshot)
            return true
        }
    }
}

private extension DeepLink {
    /// Catalog-dependent routes must not navigate before the catalog is ready.
    var requiresCatalog: Bool {
        switch self {
        case .product, .category: true
        case .favorites, .recentlyViewed, .cart, .branches, .orders, .order: false
        }
    }
}

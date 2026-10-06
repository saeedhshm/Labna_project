import Observation
import SwiftUI

/// Catalog lookups a deep link needs before it can be trusted.
///
/// Keeping this a protocol means the router stays free of catalog internals
/// and can be tested with a fixed snapshot.
protocol DeepLinkResolving: Sendable {
    func product(id: String) -> Product?
    func category(id: String) -> Category?
}

extension CatalogSnapshot: DeepLinkResolving {
    func product(id: String) -> Product? {
        products.first { $0.id == id }
    }

    func category(id: String) -> Category? {
        categories.first { $0.id == id }
    }
}

enum AppTab: Int, Hashable {
    case home, catalog, cart, more
}

@MainActor
@Observable
final class AppRouter {
    var selectedTab: AppTab = .home
    var homePath: [AppDestination] = []
    var catalogPath: [AppDestination] = []
    var cartPath: [AppDestination] = []
    var morePath: [AppDestination] = []
    /// Order a deep link asked for, revealed by `OrdersView` once it loads.
    /// Held rather than pushed directly because the detail screen needs the
    /// order, which only exists after the list has been fetched.
    private(set) var pendingOrderID: String?
    private(set) var cartNavigationID = UUID()

    init() {}

    /// Forgets the deep link's order request once it has been acted on.
    func consumePendingOrderID() {
        pendingOrderID = nil
    }

    func show(_ tab: AppTab) {
        resetPaths()
        selectedTab = tab
    }

    func path(for tab: AppTab) -> [AppDestination] {
        switch tab {
        case .home: homePath
        case .catalog: catalogPath
        case .cart: cartPath
        case .more: morePath
        }
    }

    func append(_ destination: AppDestination, on tab: AppTab) {
        switch tab {
        case .home: homePath.append(destination)
        case .catalog: catalogPath.append(destination)
        case .cart: cartPath.append(destination)
        case .more: morePath.append(destination)
        }
    }

    /// Resets a tab's stack so a deep link never lands on a corrupted path.
    func reset(_ tab: AppTab) {
        switch tab {
        case .home: homePath = []
        case .catalog: catalogPath = []
        case .cart: resetCartStack()
        case .more: morePath = []
        }
    }

    func resetPaths() {
        homePath = []
        catalogPath = []
        morePath = []
        resetCartStack()
    }

    /// Selects the owning tab, clears its stack and pushes the destination.
    ///
    /// The catalog is only consulted for the two catalog-dependent routes so an
    /// unknown id can never push a screen that would show unrelated content.
    @discardableResult
    func handle(_ deepLink: DeepLink, catalog: (any DeepLinkResolving)?) -> DeepLinkOutcome {
        switch deepLink {
        case .product(let id):
            guard let catalog else { return .rejected(.catalogUnavailable) }
            guard let product = catalog.product(id: id) else { return .rejected(.unknownProduct) }
            return navigate(.product(product), on: .home)
        case .category(let id):
            guard let catalog else { return .rejected(.catalogUnavailable) }
            guard catalog.category(id: id) != nil else { return .rejected(.unknownCategory) }
            return navigate(.category(id: id), on: .catalog)
        case .favorites:
            return navigate(.favorites, on: .more)
        case .recentlyViewed:
            return navigate(.recentlyViewed, on: .more)
        case .cart:
            show(.cart)
            return .handled
        case .branches:
            return navigate(.branches, on: .more)
        case .orders:
            return navigate(.orders, on: .more)
        case .order(let id):
            // Order history belongs to the account area, so the link opens the
            // list and remembers which order to reveal once it has loaded.
            pendingOrderID = id
            return navigate(.orders, on: .more)
        }
    }

    private func navigate(_ destination: AppDestination, on tab: AppTab) -> DeepLinkOutcome {
        reset(tab)
        selectedTab = tab
        append(destination, on: tab)
        return .handled
    }

    private func resetCartStack() {
        cartPath = []
        cartNavigationID = UUID()
    }
}

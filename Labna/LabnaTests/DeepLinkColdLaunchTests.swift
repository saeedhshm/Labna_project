import Foundation
import Testing
@testable import Labna

/// Cold launch behaviour: the URL arrives before the catalog exists, so the link
/// must be held and replayed from real application state. No timing involved.
@MainActor
struct DeepLinkColdLaunchTests {
    private func url(_ string: String) throws -> URL {
        try #require(URL(string: string))
    }

    @Test func coldLaunchHoldsTheLinkUntilTheCatalogIsReady() throws {
        let catalog = try CatalogFixture.snapshot()
        let router = AppRouter()
        let coordinator = DeepLinkCoordinator(router: router)

        coordinator.update(readiness: .loading)
        coordinator.open(try url("labna://product/milk-full"))

        #expect(coordinator.pending == .product(id: "milk-full"))
        #expect(router.homePath.isEmpty, "Navigation must wait for the catalog")
        #expect(router.selectedTab == .home)

        coordinator.update(readiness: .ready(catalog))

        let product = try #require(catalog.product(id: "milk-full"))
        #expect(coordinator.pending == nil, "A handled link is cleared")
        #expect(router.homePath == [.product(product)])
        #expect(router.selectedTab == .home)
    }

    @Test func aHandledLinkIsNotExecutedAgainOnLaterStateUpdates() throws {
        let catalog = try CatalogFixture.snapshot()
        let router = AppRouter()
        let coordinator = DeepLinkCoordinator(router: router)

        coordinator.update(readiness: .ready(catalog))
        coordinator.open(try url("labna://product/milk-full"))
        #expect(router.homePath.count == 1)

        // Simulates further SwiftUI updates and later catalog refreshes.
        coordinator.update(readiness: .ready(catalog))
        coordinator.update(readiness: .ready(catalog))
        #expect(coordinator.flush() == false)
        coordinator.update(readiness: .loading)
        coordinator.update(readiness: .ready(catalog))

        #expect(router.homePath.count == 1, "Exactly once")
    }

    @Test func coldLaunchWithAnUnknownIdentifierFailsSafely() throws {
        let catalog = try CatalogFixture.snapshot()
        let router = AppRouter()
        let coordinator = DeepLinkCoordinator(router: router)
        coordinator.update(readiness: .ready(catalog))

        coordinator.open(try url("labna://product/deleted-product"))
        #expect(coordinator.lastOutcome == .rejected(.unknownProduct))
        #expect(coordinator.pending == nil)
        #expect(router.homePath.isEmpty)

        coordinator.open(try url("labna://category/deleted-category"))
        #expect(coordinator.lastOutcome == .rejected(.unknownCategory))
        #expect(router.catalogPath.isEmpty)
    }

    @Test func coldLaunchWhenTheCatalogFailsDoesNotLeaveALinkPendingForever() {
        let router = AppRouter()
        let coordinator = DeepLinkCoordinator(router: router)
        coordinator.update(readiness: .loading)
        coordinator.open(DeepLink.product(id: "milk-full"))
        #expect(coordinator.pending != nil)

        coordinator.update(readiness: .unavailable)

        #expect(coordinator.pending == nil)
        #expect(coordinator.lastOutcome == .rejected(.catalogUnavailable))
        #expect(router.homePath.isEmpty)
    }

    @Test func warmLaunchNavigatesImmediatelyForCatalogFreeLinks() throws {
        let router = AppRouter()
        let coordinator = DeepLinkCoordinator(router: router)
        coordinator.update(readiness: .loading)

        coordinator.open(try url("labna://favorites"))
        #expect(coordinator.pending == nil, "No catalog is required")
        #expect(router.selectedTab == .more)
        #expect(router.morePath == [.favorites])

        coordinator.open(try url("labna://cart"))
        #expect(router.selectedTab == .cart)
    }

    @Test func unsupportedURLsAreIgnoredWithoutFallbackNavigation() throws {
        let router = AppRouter()
        let coordinator = DeepLinkCoordinator(router: router)
        coordinator.update(readiness: .ready(try CatalogFixture.snapshot()))

        coordinator.open(try url("labna://unknown-route"))
        coordinator.open(try url("otherapp://cart"))
        coordinator.open(try url("labna://product"))

        #expect(router.selectedTab == .home)
        #expect(router.homePath.isEmpty)
        #expect(router.morePath.isEmpty)
        #expect(router.cartPath.isEmpty)
        #expect(coordinator.pending == nil)
    }

    @Test func onlyTheMostRecentPendingLinkIsHandled() throws {
        let catalog = try CatalogFixture.snapshot()
        let router = AppRouter()
        let coordinator = DeepLinkCoordinator(router: router)
        coordinator.update(readiness: .loading)

        coordinator.open(DeepLink.product(id: "milk-full"))
        coordinator.open(DeepLink.product(id: "yogurt-greek"))

        coordinator.update(readiness: .ready(catalog))
        #expect(router.homePath == [.product(try #require(catalog.product(id: "yogurt-greek")))])
    }

    @Test func catalogStateMapsToReadiness() throws {
        let catalog = try CatalogFixture.snapshot()
        #expect(DeepLinkCoordinator.readiness(for: .idle) == .loading)
        #expect(DeepLinkCoordinator.readiness(for: .initialLoading) == .loading)
        #expect(DeepLinkCoordinator.readiness(for: .available(catalog, status: .fresh(lastSuccessfulSync: nil), refreshError: nil)) == .ready(catalog))
        #expect(DeepLinkCoordinator.readiness(for: .refreshing(catalog, status: .fresh(lastSuccessfulSync: nil))) == .ready(catalog))
        #expect(DeepLinkCoordinator.readiness(for: .fatal(.unexpected)) == .unavailable)
    }
}

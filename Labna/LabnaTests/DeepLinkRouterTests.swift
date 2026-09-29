import Foundation
import Testing
@testable import Labna

@MainActor
struct DeepLinkRouterTests {
    @Test func productLinkNavigatesToProductDetails() throws {
        let catalog = try CatalogFixture.snapshot()
        let router = AppRouter()
        let product = try #require(catalog.product(id: "milk-full"))

        #expect(router.handle(.product(id: "milk-full"), catalog: catalog) == .handled)
        #expect(router.selectedTab == .home)
        #expect(router.homePath == [.product(product)])
    }

    @Test func categoryLinkSelectsProductsTabWithThatCategory() throws {
        let catalog = try CatalogFixture.snapshot()
        let router = AppRouter()

        #expect(router.handle(.category(id: "milk"), catalog: catalog) == .handled)
        #expect(router.selectedTab == .catalog)
        #expect(router.catalogPath == [.category(id: "milk")])
    }

    @Test func favoritesAndBranchesOpenInsideMore() throws {
        let catalog = try CatalogFixture.snapshot()
        let router = AppRouter()

        #expect(router.handle(.favorites, catalog: catalog) == .handled)
        #expect(router.selectedTab == .more)
        #expect(router.morePath == [.favorites])

        #expect(router.handle(.branches, catalog: catalog) == .handled)
        #expect(router.selectedTab == .more)
        #expect(router.morePath == [.branches])
    }

    @Test func cartLinkSelectsCartTabWithoutPushing() throws {
        let catalog = try CatalogFixture.snapshot()
        let router = AppRouter()

        #expect(router.handle(.cart, catalog: catalog) == .handled)
        #expect(router.selectedTab == .cart)
        #expect(router.cartPath.isEmpty)
    }

    @Test func unknownIdentifiersAreRejectedAndLeaveNavigationUntouched() throws {
        let catalog = try CatalogFixture.snapshot()
        let router = AppRouter()
        router.show(.home)
        router.append(.favorites, on: .home)

        #expect(router.handle(.product(id: "deleted-product"), catalog: catalog) == .rejected(.unknownProduct))
        #expect(router.handle(.category(id: "deleted-category"), catalog: catalog) == .rejected(.unknownCategory))
        #expect(router.selectedTab == .home)
        #expect(router.homePath == [.favorites])
    }

    @Test func catalogDependentLinksFailWhenTheCatalogIsUnavailable() {
        let router = AppRouter()
        #expect(router.handle(.product(id: "milk-full"), catalog: nil) == .rejected(.catalogUnavailable))
        #expect(router.handle(.category(id: "milk"), catalog: nil) == .rejected(.catalogUnavailable))
        #expect(router.selectedTab == .home)
        #expect(router.homePath.isEmpty)
    }

    @Test func deepLinkResetsTheTargetStackInsteadOfCorruptingIt() throws {
        let catalog = try CatalogFixture.snapshot()
        let router = AppRouter()

        // A deep stack on the destination tab is replaced, not appended to.
        router.selectedTab = .more
        router.morePath = [.favorites, .about, .branches]
        #expect(router.handle(.branches, catalog: catalog) == .handled)
        #expect(router.morePath == [.branches], "The previous stack is discarded")

        // Other tabs keep their own history; only the target tab is prepared.
        router.append(.favorites, on: .home)
        #expect(router.handle(.product(id: "milk-full"), catalog: catalog) == .handled)
        #expect(router.homePath.count == 1)
        #expect(router.morePath == [.branches])
        #expect(router.selectedTab == .home)
    }

    @Test func repeatedDeepLinksToTheSameDestinationDoNotStackUp() throws {
        let catalog = try CatalogFixture.snapshot()
        let router = AppRouter()

        router.handle(.favorites, catalog: catalog)
        router.handle(.favorites, catalog: catalog)
        #expect(router.morePath == [.favorites])

        router.handle(.branches, catalog: catalog)
        #expect(router.morePath == [.branches])
    }

    @Test func showResetsEveryStack() {
        let router = AppRouter()
        router.append(.favorites, on: .home)
        router.append(.favorites, on: .catalog)
        router.append(.favorites, on: .more)
        router.append(.favorites, on: .cart)
        let previousCartID = router.cartNavigationID

        router.show(.home)

        #expect(router.selectedTab == .home)
        #expect(router.homePath.isEmpty)
        #expect(router.catalogPath.isEmpty)
        #expect(router.morePath.isEmpty)
        #expect(router.cartPath.isEmpty)
        #expect(router.cartNavigationID != previousCartID)
    }
}

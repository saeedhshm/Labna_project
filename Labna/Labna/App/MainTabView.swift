import SwiftUI

struct MainTabView: View {
    @Environment(AppContainer.self) private var container

    var body: some View {
        @Bindable var settings = container.settings
        @Bindable var router = container.router

        TabView(selection: $router.selectedTab) {
            NavigationStack(path: $router.homePath) {
                HomeView()
                    .navigationDestination(for: AppDestination.self, destination: destinationView)
            }
            .tabItem {
                Label("tab.home", systemImage: "house")
            }
            .tag(AppTab.home)

            NavigationStack(path: $router.catalogPath) {
                CatalogView()
                    .navigationDestination(for: AppDestination.self, destination: destinationView)
            }
            .tabItem {
                Label("tab.products", systemImage: "square.grid.2x2")
            }
            .tag(AppTab.catalog)

            NavigationStack(path: $router.cartPath) {
                CartView()
                    .navigationDestination(for: AppDestination.self, destination: destinationView)
            }
            .id(router.cartNavigationID)
            .tabItem {
                Label("tab.cart", systemImage: "bag")
            }
            .badge(container.cart.totalQuantity)
            .tag(AppTab.cart)

            NavigationStack(path: $router.morePath) {
                MoreView()
                    .navigationDestination(for: AppDestination.self, destination: destinationView)
            }
            .tabItem {
                Label("tab.more", systemImage: "ellipsis")
            }
            .tag(AppTab.more)
        }
        // Recreate cached native navigation titles when the app language changes.
        .id(settings.language)
        .toolbarBackground(.white, for: .tabBar)
        .toolbarBackground(.visible, for: .tabBar)
    }

    /// Single mapping from a router destination to an existing screen. Deep
    /// links and in-app navigation therefore land on identical views.
    @ViewBuilder
    private func destinationView(_ destination: AppDestination) -> some View {
        switch destination {
        case .product(let product):
            ProductDetailsView(product: product, language: language)
        case .category(let id):
            CatalogView(initialCategoryID: id)
        case .favorites:
            FavoritesView()
        case .recentlyViewed:
            RecentlyViewedView()
        case .branches:
            BranchListView()
        case .addresses:
            AddressesView()
        case .orders:
            OrdersView()
        case .about:
            AboutLabnaView()
        case .contact:
            ContactView()
        }
    }

    private var language: AppLanguage { container.settings.language }
}

#Preview {
    AppRootView(container: .preview(language: .arabic))
}

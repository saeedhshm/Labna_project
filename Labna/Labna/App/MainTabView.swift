import SwiftUI

struct MainTabView: View {
    @Environment(AppContainer.self) private var container

    var body: some View {
        @Bindable var settings = container.settings
        @Bindable var router = container.router

        TabView(selection: $router.selectedTab) {
            NavigationStack {
                HomeView()
            }
            .tabItem {
                Label("tab.home", systemImage: "house")
            }
            .tag(AppTab.home)

            NavigationStack {
                CatalogView()
            }
            .tabItem {
                Label("tab.products", systemImage: "square.grid.2x2")
            }
            .tag(AppTab.catalog)

            NavigationStack(path: $router.cartPath) {
                CartView()
            }
            .id(router.cartNavigationID)
            .tabItem {
                Label("tab.cart", systemImage: "bag")
            }
            .badge(container.cart.totalQuantity)
            .tag(AppTab.cart)

            NavigationStack {
                MoreView()
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
}

#Preview {
    AppRootView(container: .preview(language: .arabic))
}

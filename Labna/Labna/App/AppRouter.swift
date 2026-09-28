import Observation
import SwiftUI

enum AppTab: Int, Hashable {
    case home, catalog, cart, more
}

@MainActor
@Observable
final class AppRouter {
    var selectedTab: AppTab = .home
    var cartPath = NavigationPath()
    private(set) var cartNavigationID = UUID()

    func show(_ tab: AppTab) {
        cartPath = NavigationPath()
        cartNavigationID = UUID()
        selectedTab = tab
    }
}

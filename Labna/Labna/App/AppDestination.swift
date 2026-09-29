import Foundation

/// A destination inside one of the tab `NavigationStack`s.
///
/// The router is the single source of truth for programmatic navigation, so
/// deep links, widgets and in-app navigation all target the same values and
/// therefore reuse the very same screens.
enum AppDestination: Hashable {
    case product(Product)
    case category(id: String)
    case favorites
    case recentlyViewed
    case branches
    case about
    case contact
}

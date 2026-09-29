import SwiftUI
import SwiftData

struct AppRootView: View {
    @State private var container: AppContainer

    init(container: AppContainer) {
        _container = State(initialValue: container)
    }

    var body: some View {
        ContentView()
            .environment(container)
            .environment(\.locale, container.settings.language.locale)
            .environment(\.layoutDirection, container.settings.language.layoutDirection)
            .tint(.labnaGreen)
            .preferredColorScheme(.light)
            .modelContainer(container.modelContainer)
            // Warm launch, backgrounded launch and cold launch all arrive here.
            .onOpenURL { url in
                container.deepLinks.open(url)
            }
            .task {
                await container.catalog.loadIfNeeded()
                container.cart.review(using: container.catalog.currentSnapshot?.products ?? [])
            }
            // Replays a link that arrived before the catalog was ready. Driven by
            // real catalog state, so it runs exactly once and never on a timer.
            .onChange(of: container.catalog.state) { _, state in
                container.deepLinks.update(readiness: DeepLinkCoordinator.readiness(for: state))
            }
    }
}

extension DeepLinkCoordinator {
    /// Maps catalog progress onto what a deep link needs to be resolved.
    static func readiness(for state: CatalogLoadState) -> CatalogReadiness {
        switch state {
        case .idle, .initialLoading:
            return .loading
        case .available(let snapshot, _, _), .refreshing(let snapshot, _):
            return .ready(snapshot)
        case .fatal:
            return .unavailable
        }
    }
}

#Preview("العربية") {
    AppRootView(container: .preview(language: .arabic))
}

#Preview("English") {
    AppRootView(container: .preview(language: .english))
}

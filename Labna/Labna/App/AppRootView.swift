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
            .task {
                await container.catalog.loadIfNeeded()
                if case .available(let snapshot, _, _) = container.catalog.state {
                    container.cart.review(using: snapshot.products)
                } else if case .refreshing(let snapshot, _) = container.catalog.state {
                    container.cart.review(using: snapshot.products)
                }
            }
    }
}

#Preview("العربية") {
    AppRootView(container: .preview(language: .arabic))
}

#Preview("English") {
    AppRootView(container: .preview(language: .english))
}

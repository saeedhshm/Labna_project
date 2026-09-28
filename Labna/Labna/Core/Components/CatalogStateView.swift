import SwiftUI

/// Shared loading/error handling for screens that consume the catalog.
struct CatalogStateView<Content: View>: View {
    let store: CatalogStore
    @ViewBuilder let content: (CatalogSnapshot) -> Content
    @State private var retryTask: Task<Void, Never>?

    var body: some View {
        Group {
            switch store.state {
            case .idle, .loading:
                LabnaLoadingView()
            case .loaded(let snapshot):
                content(snapshot)
            case .failed(let error):
                LabnaErrorStateView(message: error.messageKey) {
                        retryTask = Task { await store.reload() }
                }
            }
        }
        .task { await store.loadIfNeeded() }
        .onDisappear { retryTask?.cancel() }
    }
}

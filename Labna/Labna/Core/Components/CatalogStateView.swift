import SwiftUI

/// Shared loading/error handling for screens that consume the catalog.
struct CatalogStateView<Content: View>: View {
    let store: CatalogStore
    @ViewBuilder let content: (CatalogSnapshot) -> Content
    @State private var retryTask: Task<Void, Never>?

    var body: some View {
        Group {
            switch store.state {
            case .idle, .initialLoading:
                LabnaLoadingView()
            case .available(let snapshot, _, let refreshError):
                catalogContent(snapshot, refreshError: refreshError)
            case .refreshing(let snapshot, _):
                catalogContent(snapshot, refreshError: nil)
            case .fatal(let error):
                LabnaErrorStateView(message: error.messageKey) {
                        retryTask = Task { await store.reload() }
                }
            }
        }
        .task { await store.loadIfNeeded() }
        .refreshable { await store.reload() }
        .onDisappear { retryTask?.cancel() }
    }

    @ViewBuilder
    private func catalogContent(_ snapshot: CatalogSnapshot, refreshError: CatalogError?) -> some View {
        VStack(spacing: 0) {
            if refreshError?.isOffline == true {
                Label("catalog.offlineSavedData", systemImage: "wifi.slash")
                    .font(LabnaTypography.caption)
                    .foregroundStyle(Color.labnaGreen)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, LabnaSpacing.large)
                    .padding(.vertical, LabnaSpacing.small)
                    .background(Color.labnaMint)
                    .accessibilityIdentifier("catalog.offlineNotice")
            }
            content(snapshot)
        }
    }
}

import SwiftUI

/// The signed-in customer's order history, newest first.
///
/// Everything here is a server record: order numbers, totals, addresses and
/// status all come from `GET /customer/orders`. Pull to refresh re-reads the
/// server, which is how a status change made in Admin reaches the device.
struct OrdersView: View {
    @Environment(AppContainer.self) private var container
    @Environment(\.dismiss) private var dismiss
    @State private var didLoad = false
    @State private var revealedOrderID: String?

    private var store: OrdersStore { container.orders }
    private var language: AppLanguage { container.settings.language }

    var body: some View {
        content
            .navigationTitle("orders.title")
            .navigationBarTitleDisplayMode(.large)
            .refreshable { await store.refresh() }
            .task {
                guard !didLoad else { return }
                didLoad = true
                await store.load()
                await revealPendingOrder()
            }
            .onChange(of: container.auth.isAuthenticated) { _, isAuthenticated in
                if !isAuthenticated { dismiss() }
            }
    }

    /// Opens the order a deep link asked for, once the list has loaded.
    private func revealPendingOrder() async {
        guard let id = container.router.pendingOrderID else { return }
        container.router.consumePendingOrderID()
        guard store.orders.contains(where: { $0.id == id || $0.orderNumber == id }) else { return }
        revealedOrderID = id
    }

    @ViewBuilder
    private var content: some View {
        if store.isEmpty {
            emptyState
        } else {
            list
        }
    }

    @ViewBuilder
    private var emptyState: some View {
        switch store.phase {
        case .failed(let error):
            LabnaErrorStateView(message: LocalizedStringKey(error.messageKey)) {
                Task { await store.load() }
            }
            .accessibilityIdentifier("orders.error")
        case .idle, .loading:
            LabnaLoadingView(title: "orders.loading")
                .accessibilityIdentifier("orders.loading")
        case .loaded, .loadingMore:
            LabnaEmptyStateView(
                title: "orders.empty.title",
                message: "orders.empty.message",
                symbol: "shippingbox"
            )
            .accessibilityIdentifier("orders.empty")
        }
    }

    private var list: some View {
        List {
            if let error = store.lastError {
                Section {
                    Label(LocalizedStringKey(error.messageKey), systemImage: "exclamationmark.circle")
                        .font(LabnaTypography.body)
                        .foregroundStyle(.red)
                        .accessibilityIdentifier("orders.error")
                }
            }

            Section {
                ForEach(store.orders) { order in
                    if revealedOrderID == order.id {
                        // A deep link asked for this order, so it opens directly.
                        NavigationLink {
                            OrderDetailView(orderID: order.id)
                        } label: {
                            OrderRow(order: order, language: language)
                        }
                        .simultaneousGesture(TapGesture().onEnded {
                            revealedOrderID = nil
                        })
                        .accessibilityIdentifier("orders.row.\(order.id)")
                    } else {
                        NavigationLink {
                            OrderDetailView(orderID: order.id)
                        } label: {
                            OrderRow(order: order, language: language)
                        }
                        .accessibilityIdentifier("orders.row.\(order.id)")
                    }
                }

                if store.hasMore {
                    HStack {
                        Spacer()
                        if store.isLoadingMore {
                            ProgressView().accessibilityIdentifier("orders.loadingMore")
                        } else {
                            Button("orders.loadMore") {
                                Task { await store.loadMore() }
                            }
                            .accessibilityIdentifier("orders.loadMore")
                        }
                        Spacer()
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Color.labnaCream.opacity(0.45))
    }
}

private struct OrderRow: View {
    let order: PlacedOrder
    let language: AppLanguage

    var body: some View {
        VStack(alignment: .leading, spacing: LabnaSpacing.small) {
            HStack {
                Text(order.orderNumber)
                    .font(LabnaTypography.headline.monospaced())
                    .foregroundStyle(Color.labnaInk)
                    .textSelection(.enabled)
                Spacer(minLength: 0)
                OrderStatusBadge(status: order.status)
            }
            Text("\(order.items.count) \(String(localized: "orders.items", comment: "item count"))")
                .font(LabnaTypography.caption)
                .foregroundStyle(Color.labnaMuted)
            HStack {
                Text(order.createdAt.formatted(date: .abbreviated, time: .shortened))
                    .font(LabnaTypography.caption)
                    .foregroundStyle(Color.labnaMuted)
                Spacer()
                PriceText(minorUnits: order.totalMinor, currencyCode: order.currencyCode)
            }
        }
        .padding(.vertical, LabnaSpacing.extraSmall)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("orders.item.\(order.id)")
    }
}

/// Status pill shared by the list and the detail screen.
struct OrderStatusBadge: View {
    let status: OrderStatus

    var body: some View {
        Label {
            Text(LocalizedStringKey(status.messageKey))
                .font(LabnaTypography.caption)
        } icon: {
            Image(systemName: status.symbolName)
        }
        .labelStyle(.titleAndIcon)
        .padding(.horizontal, LabnaSpacing.small)
        .padding(.vertical, LabnaSpacing.extraSmall)
        .foregroundStyle(tint)
        .background(tint.opacity(0.12), in: Capsule())
        .accessibilityIdentifier("orders.status.\(status.rawValue)")
    }

    private var tint: Color {
        switch status {
        case .pending, .confirmed: Color.labnaInk
        case .preparing, .ready, .outForDelivery: Color.labnaGreen
        case .completed: Color.labnaGreen
        case .cancelled: Color.red
        }
    }
}

#Preview("Empty") {
    NavigationStack { OrdersView() }
        .environment(AppContainer.preview(language: .english))
}

#Preview("Arabic") {
    NavigationStack { OrdersView() }
        .environment(AppContainer.preview(language: .arabic))
}
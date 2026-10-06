import SwiftUI

/// One order in full: number, when it was placed, what was bought, what it cost,
/// how it is paid, where it goes, where it is now, and how it got there.
///
/// Every figure and timestamp is the server's. The status timeline is built from
/// the API's own `statusHistory`, so a step only appears once the backend has
/// actually recorded it.
struct OrderDetailView: View {
    let orderID: String

    @Environment(AppContainer.self) private var container
    @Environment(\.dismiss) private var dismiss
    @State private var loaded = false
    @State private var isConfirmingCancel = false

    private var store: OrdersStore { container.orders }
    private var language: AppLanguage { container.settings.language }

    var body: some View {
        ScrollView {
            if let order = store.details[orderID] {
                VStack(alignment: .leading, spacing: LabnaSpacing.large) {
                    header(order)
                    statusCard(order)
                    items(order)
                    totals(order)
                    payment(order)
                    address(order)
                    cancelSection(order)
                }
                .padding(LabnaSpacing.large)
            } else if let error = store.detailPhases[orderID] ?? nil {
                VStack(spacing: LabnaSpacing.medium) {
                    LabnaErrorStateView(message: LocalizedStringKey(error.messageKey)) {
                        Task { await store.loadDetail(id: orderID, forceRefresh: true) }
                    }
                    .accessibilityIdentifier("orders.detail.error")
                }
                .padding(LabnaSpacing.large)
            } else {
                LabnaLoadingView(title: "orders.loading")
                    .padding(LabnaSpacing.large)
                    .accessibilityIdentifier("orders.detail.loading")
            }
        }
        .background(Color.labnaCream.opacity(0.25))
        .navigationTitle("orders.detail.title")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await store.loadDetail(id: orderID, forceRefresh: true) }
        .task {
            guard !loaded else { return }
            loaded = true
            await store.loadDetail(id: orderID)
        }
        .onChange(of: container.auth.isAuthenticated) { _, isAuthenticated in
            if !isAuthenticated { dismiss() }
        }
        .confirmationDialog(
            "orders.cancel.confirmTitle",
            isPresented: $isConfirmingCancel,
            presenting: store.details[orderID]
        ) { order in
            Button("orders.cancel.confirmAction", role: .destructive) {
                Task { await store.cancel(id: order.id) }
            }
            .accessibilityIdentifier("orders.cancel.confirm")
            Button("orders.cancel.dismissAction", role: .cancel) {}
        } message: { order in
            // The number is quoted so it is obvious what is being cancelled.
            Text("orders.cancel.confirmMessage \(order.orderNumber)")
        }
    }

    /// Cancellation is offered only for an order the API still allows it on,
    /// which is `pending`. Any other state hides the action entirely rather than
    /// showing a button that would be refused.
    @ViewBuilder
    private func cancelSection(_ order: PlacedOrder) -> some View {
        if let failure = store.cancelFailure {
            Label {
                Text(LocalizedStringKey(failure.messageKey))
                    .font(LabnaTypography.body)
            } icon: {
                Image(systemName: "exclamationmark.triangle.fill")
            }
            .foregroundStyle(.orange)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(LabnaSpacing.medium)
            .background(Color.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: LabnaRadius.medium))
            .accessibilityIdentifier("orders.cancel.error")
        }

        if order.status.isCancellableByCustomer {
            Button(role: .destructive) {
                store.clearCancelFailure()
                isConfirmingCancel = true
            } label: {
                if store.isCancelling(order.id) {
                    HStack {
                        ProgressView()
                        Text("orders.cancel.progress")
                    }
                } else {
                    Text("orders.cancel.action")
                }
            }
            .disabled(store.isCancelling(order.id))
            .accessibilityIdentifier("orders.cancel.action")
        }
    }

    // MARK: - Sections

    private func header(_ order: PlacedOrder) -> some View {
        VStack(alignment: .leading, spacing: LabnaSpacing.extraSmall) {
            Text("orders.detail.number")
                .font(LabnaTypography.caption)
                .foregroundStyle(Color.labnaMuted)
            Text(order.orderNumber)
                .font(LabnaTypography.title.monospaced())
                .foregroundStyle(Color.labnaInk)
                .textSelection(.enabled)
                .accessibilityIdentifier("orders.detail.orderNumber")
            HStack(spacing: LabnaSpacing.small) {
                Image(systemName: "calendar")
                    .accessibilityHidden(true)
                Text(order.createdAt.formatted(date: .long, time: .shortened))
                    .accessibilityIdentifier("orders.detail.createdAt")
            }
            .font(LabnaTypography.body)
            .foregroundStyle(Color.labnaMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(LabnaSpacing.medium)
        .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.large))
        .overlay { RoundedRectangle(cornerRadius: LabnaRadius.large).stroke(Color.labnaBorder) }
    }

    @ViewBuilder
    private func statusCard(_ order: PlacedOrder) -> some View {
        VStack(alignment: .leading, spacing: LabnaSpacing.medium) {
            Text("orders.detail.status")
                .font(LabnaTypography.brand)
                .foregroundStyle(Color.labnaInk)
            OrderStatusBadge(status: order.status)
                .accessibilityIdentifier("orders.detail.currentStatus")

            if !order.timeline.isEmpty {
                Divider()
                ForEach(Array(order.timeline.enumerated()), id: \.element.id) { index, event in
                    timelineRow(event, isLast: index == order.timeline.count - 1)
                }
            } else {
                // No recorded history means the order has not moved yet.
                Text("orders.detail.noTimeline")
                    .font(LabnaTypography.caption)
                    .foregroundStyle(Color.labnaMuted)
                    .accessibilityIdentifier("orders.detail.noTimeline")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(LabnaSpacing.medium)
        .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.large))
        .overlay { RoundedRectangle(cornerRadius: LabnaRadius.large).stroke(Color.labnaBorder) }
    }

    private func timelineRow(_ event: OrderStatusEvent, isLast: Bool) -> some View {
        HStack(alignment: .top, spacing: LabnaSpacing.medium) {
            VStack(spacing: 0) {
                Image(systemName: event.status.symbolName)
                    .font(.caption)
                    .foregroundStyle(event.status.isTerminal ? Color.labnaGreen : Color.labnaInk)
                    .frame(width: 24, height: 24)
                    .background(Color.labnaMint, in: Circle())
                if !isLast {
                    Rectangle()
                        .fill(Color.labnaBorder)
                        .frame(width: 2, height: 26)
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(LocalizedStringKey(event.status.messageKey))
                    .font(LabnaTypography.body)
                // The timestamp is the server's, never a locally guessed one.
                Text(event.at.formatted(date: .abbreviated, time: .shortened))
                    .font(LabnaTypography.caption)
                    .foregroundStyle(Color.labnaMuted)
                if !event.isSystemChange {
                    Text("orders.detail.byStaff")
                        .font(LabnaTypography.caption)
                        .foregroundStyle(Color.labnaMuted)
                }
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("orders.timeline.\(event.status.rawValue)")
    }

    private func items(_ order: PlacedOrder) -> some View {
        VStack(alignment: .leading, spacing: LabnaSpacing.medium) {
            Text("orders.items")
                .font(LabnaTypography.brand)
                .foregroundStyle(Color.labnaInk)
            ForEach(order.items, id: \.variantID) { item in
                HStack(alignment: .top, spacing: LabnaSpacing.medium) {
                    VStack(alignment: .leading, spacing: LabnaSpacing.extraSmall) {
                        // Snapshots taken when the order was placed, so a later
                        // catalog change cannot rewrite history.
                        Text(item.productName.value(for: language))
                            .font(LabnaTypography.headline)
                        Text("\(item.variantLabel.value(for: language)) × \(item.quantity)")
                            .font(LabnaTypography.caption)
                            .foregroundStyle(Color.labnaMuted)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        PriceText(minorUnits: item.lineTotalMinor, currencyCode: order.currencyCode)
                        Text(PriceFormatter.string(
                            minorUnits: item.unitPriceMinor,
                            currencyCode: order.currencyCode,
                            locale: language.locale
                        ))
                        .font(LabnaTypography.caption)
                        .foregroundStyle(Color.labnaMuted)
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("orders.item.\(item.variantID)")
                if item.variantID != order.items.last?.variantID { Divider() }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(LabnaSpacing.medium)
        .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.large))
        .overlay { RoundedRectangle(cornerRadius: LabnaRadius.large).stroke(Color.labnaBorder) }
    }

    private func totals(_ order: PlacedOrder) -> some View {
        VStack(spacing: LabnaSpacing.small) {
            totalRow("checkout.total.items", order.subtotalMinor, order.currencyCode)
            totalRow("checkout.total.delivery", order.deliveryFeeMinor, order.currencyCode)
            if order.discountMinor > 0 {
                totalRow("checkout.total.discount", -order.discountMinor, order.currencyCode, tint: Color.labnaGreen)
                Text("checkout.total.discountCoupon \(order.couponCode)")
                    .font(LabnaTypography.caption)
                    .foregroundStyle(Color.labnaGreen)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            Divider()
            HStack {
                Text("checkout.total.payable").font(LabnaTypography.title)
                Spacer()
                PriceText(minorUnits: order.totalMinor, currencyCode: order.currencyCode)
            }
            .accessibilityIdentifier("orders.detail.total")
        }
        .padding(LabnaSpacing.medium)
        .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.medium))
        .overlay { RoundedRectangle(cornerRadius: LabnaRadius.medium).stroke(Color.labnaBorder) }
    }

    private func totalRow(
        _ title: LocalizedStringKey,
        _ minorUnits: Int,
        _ currencyCode: String,
        tint: Color = .primary
    ) -> some View {
        HStack {
            Text(title).font(LabnaTypography.body)
            Spacer()
            PriceText(minorUnits: minorUnits, currencyCode: currencyCode)
        }
        .foregroundStyle(tint)
    }

    private func payment(_ order: PlacedOrder) -> some View {
        VStack(alignment: .leading, spacing: LabnaSpacing.small) {
            Text("orders.detail.payment")
                .font(LabnaTypography.brand)
                .foregroundStyle(Color.labnaInk)
            detailRow("checkout.payment.title", Text(LocalizedStringKey(order.payment.method.messageKey)))
            detailRow("orders.detail.paymentStatus", Text(paymentStatusLabel(order.payment.status)))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(LabnaSpacing.medium)
        .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.large))
        .overlay { RoundedRectangle(cornerRadius: LabnaRadius.large).stroke(Color.labnaBorder) }
        .accessibilityIdentifier("orders.detail.payment")
    }

    private func paymentStatusLabel(_ status: PaymentStatus) -> String {
        switch status {
        case .pending: "orders.payment.pending"
        case .paid: "orders.payment.paid"
        case .failed: "orders.payment.failed"
        }
    }

    private func address(_ order: PlacedOrder) -> some View {
        VStack(alignment: .leading, spacing: LabnaSpacing.small) {
            Text("checkout.address.title")
                .font(LabnaTypography.brand)
                .foregroundStyle(Color.labnaInk)
            // The address as it was at checkout, not the customer's current one.
            Text([order.address.city, order.address.area, order.address.street, order.address.building]
                .filter { !$0.isEmpty }
                .joined(separator: ", "))
                .font(LabnaTypography.body)
            let extras = [order.address.floor, order.address.apartment].filter { !$0.isEmpty }
            if !extras.isEmpty {
                Text(extras.joined(separator: " · "))
                    .font(LabnaTypography.caption)
                    .foregroundStyle(Color.labnaMuted)
            }
            if !order.address.notes.isEmpty {
                Text(order.address.notes)
                    .font(LabnaTypography.caption)
                    .foregroundStyle(Color.labnaMuted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(LabnaSpacing.medium)
        .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.large))
        .overlay { RoundedRectangle(cornerRadius: LabnaRadius.large).stroke(Color.labnaBorder) }
        .accessibilityIdentifier("orders.detail.address")
    }

    private func detailRow(_ title: LocalizedStringKey, _ value: Text) -> some View {
        HStack {
            Text(title).font(LabnaTypography.body).foregroundStyle(Color.labnaMuted)
            Spacer()
            value.font(LabnaTypography.body)
        }
    }
}
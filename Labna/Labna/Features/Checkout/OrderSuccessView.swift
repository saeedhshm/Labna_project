import SwiftUI

/// Confirmation for a real order created through the API.
///
/// Everything shown here is the server's record: the `LBN-...` order number, the
/// delivery fee and any discount the API actually applied, and the payable
/// total. Nothing is recomputed on the device.
struct OrderSuccessView: View {
    let order: PlacedOrder
    let language: AppLanguage
    @Environment(AppContainer.self) private var container

    var body: some View {
        ScrollView {
            VStack(spacing: LabnaSpacing.large) {
                successHeader
                reference
                summary
                delivery
                actions
            }
            .padding(LabnaSpacing.large)
            .padding(.bottom, LabnaSpacing.extraLarge)
        }
        .background(Color.labnaCream.opacity(0.25))
        .navigationTitle("success.title")
        .navigationBarBackButtonHidden(true)
    }

    private var successHeader: some View {
        VStack(spacing: LabnaSpacing.medium) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 72))
                .foregroundStyle(Color.labnaGreen)
                .accessibilityHidden(true)
            Text("success.heading")
                .font(LabnaTypography.title)
                .foregroundStyle(Color.labnaInk)
                .multilineTextAlignment(.center)
                .accessibilityIdentifier("checkout.success")
        }
    }

    private var reference: some View {
        VStack(spacing: LabnaSpacing.extraSmall) {
            Text("success.reference")
                .font(LabnaTypography.caption)
                .foregroundStyle(Color.labnaMuted)
            Text(order.orderNumber)
                .font(.headline.monospaced())
                .textSelection(.enabled)
                .accessibilityIdentifier("success.reference")
            // The order is linked to the signed-in customer, so it also appears
            // in their order history.
            Text("success.linkedAccount")
                .font(LabnaTypography.caption)
                .foregroundStyle(Color.labnaMuted)
                .multilineTextAlignment(.center)
                .accessibilityIdentifier("success.linkedAccount")
        }
        .padding(LabnaSpacing.medium)
        .frame(maxWidth: .infinity)
        .background(Color.labnaMint, in: RoundedRectangle(cornerRadius: LabnaRadius.medium))
    }

    private var summary: some View {
        VStack(alignment: .leading, spacing: LabnaSpacing.medium) {
            Text("success.summary").font(LabnaTypography.brand)
            ForEach(order.items, id: \.variantID) { item in
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: LabnaSpacing.extraSmall) {
                        Text(item.productName.value(for: language)).font(LabnaTypography.headline)
                        Text("\(item.variantLabel.value(for: language)) × \(item.quantity)")
                            .font(LabnaTypography.caption)
                            .foregroundStyle(Color.labnaMuted)
                    }
                    Spacer()
                    PriceText(minorUnits: item.lineTotalMinor, currencyCode: order.currencyCode)
                }
            }
            Divider()
            totalRow("checkout.total.items", order.subtotalMinor)
            totalRow("checkout.total.delivery", order.deliveryFeeMinor)
            if order.couponApplied {
                totalRow("checkout.total.discount", -order.discountMinor, tint: Color.labnaGreen)
                Text("checkout.total.discountCoupon \(order.couponCode)")
                    .font(LabnaTypography.caption)
                    .foregroundStyle(Color.labnaGreen)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else if order.couponIgnored {
                // The API accepts any code and simply grants no discount, so an
                // unrecognised coupon is reported rather than silently ignored.
                totalRow("checkout.total.discount", 0)
                Text("checkout.total.couponIgnored \(order.couponCode)")
                    .font(LabnaTypography.caption)
                    .foregroundStyle(Color.orange)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityIdentifier("success.couponIgnored")
            }
            Divider()
            HStack {
                Text("checkout.total.payable").font(LabnaTypography.title)
                Spacer()
                PriceText(minorUnits: order.totalMinor, currencyCode: order.currencyCode)
            }
            .accessibilityIdentifier("success.total")
        }
        .padding(LabnaSpacing.medium)
        .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.large))
        .overlay { RoundedRectangle(cornerRadius: LabnaRadius.large).stroke(Color.labnaBorder) }
    }

    private var delivery: some View {
        VStack(alignment: .leading, spacing: LabnaSpacing.medium) {
            Text("checkout.address.title").font(LabnaTypography.brand)
            Text([order.address.city, order.address.area, order.address.street, order.address.building]
                .filter { !$0.isEmpty }
                .joined(separator: ", "))
                .font(LabnaTypography.body)
            if !order.address.floor.isEmpty || !order.address.apartment.isEmpty {
                Text([order.address.floor, order.address.apartment]
                    .filter { !$0.isEmpty }
                    .joined(separator: " · "))
                    .font(LabnaTypography.caption)
                    .foregroundStyle(Color.labnaMuted)
            }
            if !order.address.notes.isEmpty {
                Text(order.address.notes)
                    .font(LabnaTypography.caption)
                    .foregroundStyle(Color.labnaMuted)
            }
            Divider()
            HStack {
                Text("checkout.payment.title").font(LabnaTypography.brand)
                Spacer()
                Text(paymentLabel).font(LabnaTypography.body)
            }
            HStack {
                Text("success.status").font(LabnaTypography.caption)
                    .foregroundStyle(Color.labnaMuted)
                Spacer()
                Text(statusLabel(order.status))
                    .font(LabnaTypography.body)
                    .accessibilityIdentifier("success.status")
            }
        }
        .padding(LabnaSpacing.medium)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.large))
        .overlay { RoundedRectangle(cornerRadius: LabnaRadius.large).stroke(Color.labnaBorder) }
    }

    private func totalRow(_ title: LocalizedStringKey, _ minorUnits: Int, tint: Color = .primary) -> some View {
        HStack {
            Text(title).font(LabnaTypography.body)
            Spacer()
            PriceText(minorUnits: minorUnits, currencyCode: order.currencyCode)
        }
        .foregroundStyle(tint)
    }

    private var paymentLabel: String {
        order.payment.method.messageKey
    }

    private func statusLabel(_ status: OrderStatus) -> String {
        switch status {
        case .pending: "checkout.status.pending"
        case .confirmed: "checkout.status.confirmed"
        case .preparing: "checkout.status.preparing"
        case .ready: "checkout.status.ready"
        case .outForDelivery: "checkout.status.outForDelivery"
        case .completed: "checkout.status.completed"
        case .cancelled: "checkout.status.cancelled"
        }
    }

    private var actions: some View {
        VStack(spacing: LabnaSpacing.small) {
            Button("success.home") { container.router.show(.home) }
                .buttonStyle(.labnaPrimary)
                .accessibilityIdentifier("success.home")
            Button("success.products") { container.router.show(.catalog) }
                .buttonStyle(.labnaSecondary)
                .accessibilityIdentifier("success.products")
        }
    }
}
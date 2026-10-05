import SwiftUI

struct CartView: View {
    @Environment(AppContainer.self) private var container

    var body: some View {
        CatalogStateView(store: container.catalog) { snapshot in
            cartContent(products: snapshot.products)
                .task(id: snapshot.products.hashValue) {
                    container.cart.review(using: snapshot.products)
                }
        }
        .navigationTitle("cart.title")
        .navigationBarTitleDisplayMode(.large)
    }

    private var validation: CartValidationStore { container.cartValidation }

    @ViewBuilder
    private func cartContent(products: [Product]) -> some View {
        if container.cart.items.isEmpty {
            LabnaEmptyStateView(
                title: "empty.title",
                message: "empty.message",
                symbol: "bag"
            )
        } else {
            ScrollView {
                LazyVStack(spacing: LabnaSpacing.medium) {
                    if container.cart.persistenceFailed {
                        statusBanner(text: "cart.persistenceError", symbol: "externaldrive.badge.exclamationmark", color: .orange)
                    }
                    validationBanner
                    if container.cart.containsUnavailableItems {
                        statusBanner(text: "cart.unavailableNotice", symbol: "exclamationmark.triangle", color: .orange)
                    }
                    ForEach(container.cart.lines) { line in
                        CartLineView(line: line, verdict: validation.verdict(for: line.id), language: language)
                    }
                    summary
                    NavigationLink {
                        CheckoutReviewView()
                    } label: {
                        Text("cart.reviewOrder")
                    }
                    .buttonStyle(.labnaPrimary)
                    .disabled(!validation.isCheckoutReady)
                    .accessibilityIdentifier("cart.checkout")
                }
                .padding(LabnaSpacing.large)
            }
            .background(Color.labnaCream.opacity(0.25))
            .refreshable { await validation.validate() }
            .task(id: cartContentKey) { await validation.validate() }
        }
    }

    /// Re-validates whenever the cart contents change, so a stale verdict can
    /// never unlock checkout.
    private var cartContentKey: Int {
        container.cart.items.reduce(into: 0) { partial, item in
            partial ^= item.productID.hashValue &* 31 &+ item.variantID.hashValue &* 17 &+ item.quantity.hashValue
        }
    }

    private var language: AppLanguage { container.settings.language }

    /// Makes the difference between cached cart state and server-confirmed state
    /// explicit, including the offline case.
    @ViewBuilder
    private var validationBanner: some View {
        if validation.isValidating {
            statusBanner(text: "cart.validation.checking", symbol: "arrow.triangle.2.circlepath", color: .labnaGreen)
        } else if validation.isCheckoutReady {
            statusBanner(text: "cart.validation.ready", symbol: "checkmark.seal.fill", color: .labnaGreen)
        } else if !validation.blockingItems.isEmpty {
            statusBanner(text: "cart.validation.blocked", symbol: "exclamationmark.octagon.fill", color: .red)
        } else if let error = validation.lastError {
            statusBanner(
                text: error.isOffline ? "cart.validation.offline" : "cart.validation.failed",
                symbol: "wifi.exclamationmark",
                color: .orange
            )
        } else {
            statusBanner(text: "cart.validation.pending", symbol: "clock", color: .orange)
        }
    }

    private func statusBanner(text: LocalizedStringKey, symbol: String, color: Color) -> some View {
        Label(text, systemImage: symbol)
            .font(LabnaTypography.body)
            .foregroundStyle(color)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(LabnaSpacing.medium)
            .background(color.opacity(0.1), in: RoundedRectangle(cornerRadius: LabnaRadius.medium))
            .accessibilityIdentifier("cart.validation.banner")
    }

    private var summary: some View {
        VStack(spacing: LabnaSpacing.medium) {
            HStack {
                Text("cart.units")
                Spacer()
                Text(container.cart.totalQuantity.formatted()).monospacedDigit()
            }
            HStack(alignment: .firstTextBaseline) {
                Text("cart.total").font(LabnaTypography.headline)
                Spacer()
                PriceText(
                    minorUnits: validation.subtotalMinor ?? container.cart.totalMinor,
                    currencyCode: validation.currencyCode ?? container.cart.currencyCode
                )
                .accessibilityIdentifier("cart.total.server")
            }
            if validation.subtotalMinor != nil {
                Text("cart.validation.serverTotal")
                    .font(LabnaTypography.caption)
                    .foregroundStyle(Color.labnaMuted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityIdentifier("cart.total.validated")
            }
            if container.cart.containsUnavailableItems || !validation.blockingItems.isEmpty {
                Text("cart.totalExcludesUnavailable")
                    .font(LabnaTypography.caption)
                    .foregroundStyle(Color.labnaMuted)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(LabnaSpacing.large)
        .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.large))
        .overlay { RoundedRectangle(cornerRadius: LabnaRadius.large).stroke(Color.labnaBorder) }
    }
}

private struct CartLineView: View {
    let line: CartLine
    let verdict: CartValidatedItem?
    let language: AppLanguage
    @Environment(AppContainer.self) private var container

    /// The server is authoritative whenever it has answered for this line;
    /// otherwise the locally cached catalog value is shown and marked as such.
    private var serverUnitPriceMinor: Int? { verdict?.unitPriceMinor }
    private var currentUnitPriceMinor: Int? { serverUnitPriceMinor ?? line.currentUnitPriceMinor }
    private var priceChanged: Bool {
        guard let currentUnitPriceMinor else { return false }
        return currentUnitPriceMinor != line.item.priceAtAdditionMinor
    }
    private var isBlocking: Bool { verdict?.valid == false }

    var body: some View {
        VStack(alignment: .leading, spacing: LabnaSpacing.medium) {
            HStack(alignment: .top, spacing: LabnaSpacing.medium) {
                ProductImage(url: verdict?.imageURL ?? line.product?.imageURLs.first)
                    .frame(width: 88)
                    .clipShape(RoundedRectangle(cornerRadius: LabnaRadius.medium))
                VStack(alignment: .leading, spacing: LabnaSpacing.extraSmall) {
                    Text(nameText)
                        .font(LabnaTypography.headline)
                        .foregroundStyle(Color.labnaInk)
                        .accessibilityIdentifier("cart.product.\(line.item.productID)")
                    Text(variantText)
                        .font(LabnaTypography.body)
                        .foregroundStyle(Color.labnaMuted)
                    price
                    if let reason = blockingReason {
                        Label(reason.messageKey, systemImage: "exclamationmark.circle.fill")
                            .font(LabnaTypography.caption)
                            .foregroundStyle(.orange)
                            .accessibilityIdentifier("cart.line.reason")
                    } else if line.availability != .available {
                        Label(availabilityKey, systemImage: "exclamationmark.circle.fill")
                            .font(LabnaTypography.caption)
                            .foregroundStyle(.orange)
                    }
                    if let verdict, verdict.reason == .insufficientStock {
                        Text("cart.availableUnits \(verdict.availableQuantity)")
                            .font(LabnaTypography.caption)
                            .foregroundStyle(.orange)
                            .accessibilityIdentifier("cart.line.availableUnits")
                    }
                }
                Spacer(minLength: 0)
                Button(role: .destructive) {
                    container.cart.remove(line.id)
                } label: {
                    Image(systemName: "trash").frame(width: 44, height: 44)
                }
                .accessibilityLabel("cart.remove")
                .accessibilityIdentifier("cart.remove.\(line.item.variantID)")
            }

            HStack {
                QuantityStepper(
                    quantity: Binding(
                        get: { line.item.quantity },
                        set: { container.cart.setQuantity($0, for: line.id) }
                    ),
                    range: 1...99
                )
                .disabled(!line.isAvailable)
                Spacer()
                if let subtotal = lineTotalMinor {
                    PriceText(minorUnits: subtotal, currencyCode: currencyCode)
                }
            }
        }
        .padding(LabnaSpacing.medium)
        .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.large))
        .overlay {
            RoundedRectangle(cornerRadius: LabnaRadius.large)
                .stroke(isBlocking ? Color.red.opacity(0.5) : Color.labnaBorder)
        }
    }

    private var nameText: String {
        verdict?.productName.value(for: language)
            ?? (line.product?.name ?? line.item.productName).value(for: language)
    }

    private var variantText: String {
        verdict?.variantLabel.value(for: language)
            ?? (line.variant?.label ?? line.item.variantLabel).value(for: language)
    }

    private var blockingReason: CartValidationReason? {
        guard let verdict, !verdict.valid else { return nil }
        return verdict.reason
    }

    private var lineTotalMinor: Int? {
        if let verdict { return verdict.lineTotalMinor }
        return line.currentSubtotalMinor
    }

    private var currencyCode: String {
        verdict?.currencyCode ?? line.item.currencyCode
    }

    /// `price at addition → current server price`, with the old price struck
    /// through only when the server confirms it changed.
    @ViewBuilder
    private var price: some View {
        if let current = currentUnitPriceMinor, verdict != nil || line.isAvailable {
            HStack(spacing: LabnaSpacing.small) {
                if priceChanged {
                    Text(PriceFormatter.string(
                        minorUnits: line.item.priceAtAdditionMinor,
                        currencyCode: line.item.currencyCode,
                        locale: language.locale
                    ))
                    .strikethrough()
                    .foregroundStyle(Color.labnaMuted)
                }
                PriceText(minorUnits: current, currencyCode: line.item.currencyCode)
            }
            if priceChanged {
                Text("cart.priceUpdated")
                    .font(LabnaTypography.caption)
                    .foregroundStyle(.orange)
                    .accessibilityIdentifier("cart.line.priceChanged")
            }
        } else {
            Text(PriceFormatter.string(
                minorUnits: line.item.priceAtAdditionMinor,
                currencyCode: line.item.currencyCode,
                locale: language.locale
            ))
            .font(LabnaTypography.price)
            .foregroundStyle(Color.labnaMuted)
            .strikethrough()
        }
    }

    private var availabilityKey: LocalizedStringKey {
        switch line.availability {
        case .available: ""
        case .productRemoved: "cart.productRemoved"
        case .variantRemoved: "cart.variantRemoved"
        case .unavailable: "cart.variantUnavailable"
        }
    }
}
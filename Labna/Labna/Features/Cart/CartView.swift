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
                        statusBanner(text: "cart.persistenceError", symbol: "externaldrive.badge.exclamationmark")
                    }
                    if container.cart.containsUnavailableItems {
                        statusBanner(text: "cart.unavailableNotice", symbol: "exclamationmark.triangle")
                    }
                    ForEach(container.cart.lines) { line in
                        CartLineView(line: line, language: language)
                    }
                    summary
                    NavigationLink {
                        CheckoutReviewView()
                    } label: {
                        Text("cart.reviewOrder")
                    }
                    .buttonStyle(.labnaPrimary)
                    .disabled(container.cart.containsUnavailableItems || container.cart.availableQuantity == 0)
                    .accessibilityIdentifier("cart.checkout")
                }
                .padding(LabnaSpacing.large)
            }
            .background(Color.labnaCream.opacity(0.25))
        }
    }

    private var language: AppLanguage { container.settings.language }

    private func statusBanner(text: LocalizedStringKey, symbol: String) -> some View {
        Label(text, systemImage: symbol)
            .font(LabnaTypography.body)
            .foregroundStyle(Color.orange)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(LabnaSpacing.medium)
            .background(Color.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: LabnaRadius.medium))
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
                    minorUnits: container.cart.totalMinor,
                    currencyCode: container.cart.currencyCode
                )
            }
            if container.cart.containsUnavailableItems {
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
    let language: AppLanguage
    @Environment(AppContainer.self) private var container

    var body: some View {
        VStack(alignment: .leading, spacing: LabnaSpacing.medium) {
            HStack(alignment: .top, spacing: LabnaSpacing.medium) {
                ProductImage(url: line.product?.imageURLs.first)
                    .frame(width: 88)
                    .clipShape(RoundedRectangle(cornerRadius: LabnaRadius.medium))
                VStack(alignment: .leading, spacing: LabnaSpacing.extraSmall) {
                    Text((line.product?.name ?? line.item.productName).value(for: language))
                        .font(LabnaTypography.headline)
                        .foregroundStyle(Color.labnaInk)
                        .accessibilityIdentifier("cart.product.\(line.item.productID)")
                    Text((line.variant?.label ?? line.item.variantLabel).value(for: language))
                        .font(LabnaTypography.body)
                        .foregroundStyle(Color.labnaMuted)
                    price
                    if line.availability != .available {
                        Label(availabilityKey, systemImage: "exclamationmark.circle.fill")
                            .font(LabnaTypography.caption)
                            .foregroundStyle(Color.orange)
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
                if let subtotal = line.currentSubtotalMinor {
                    PriceText(minorUnits: subtotal, currencyCode: line.item.currencyCode)
                }
            }
        }
        .padding(LabnaSpacing.medium)
        .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.large))
        .overlay {
            RoundedRectangle(cornerRadius: LabnaRadius.large)
                .stroke(line.isAvailable ? Color.labnaBorder : Color.orange.opacity(0.45))
        }
    }

    @ViewBuilder
    private var price: some View {
        if let current = line.currentUnitPriceMinor {
            HStack(spacing: LabnaSpacing.small) {
                if line.hasPriceChanged {
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
            if line.hasPriceChanged {
                Text("cart.priceUpdated")
                    .font(LabnaTypography.caption)
                    .foregroundStyle(Color.orange)
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

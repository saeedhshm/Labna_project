import SwiftUI

struct CheckoutReviewView: View {
    @Environment(AppContainer.self) private var container
    @State private var checkout = DemoCheckoutStore()
    @State private var notes = ""
    @State private var completedOrder: DemoOrder?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LabnaSpacing.large) {
                demoNotice
                orderLines
                notesField
                totals
                if let error = checkout.error {
                    Label(LocalizedStringKey(error.messageKey), systemImage: "exclamationmark.triangle")
                        .font(LabnaTypography.body)
                        .foregroundStyle(Color.orange)
                        .accessibilityIdentifier("checkout.error")
                }
            }
            .padding(LabnaSpacing.large)
            .padding(.bottom, 88)
        }
        .background(Color.labnaCream.opacity(0.25))
        .navigationTitle("checkout.title")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            confirmButton.padding(LabnaSpacing.medium).background(.ultraThinMaterial)
        }
        .navigationDestination(item: $completedOrder) { order in
            OrderSuccessView(order: order, language: language)
        }
    }

    private var language: AppLanguage { container.settings.language }

    private var demoNotice: some View {
        Label {
            VStack(alignment: .leading, spacing: LabnaSpacing.extraSmall) {
                Text("checkout.demoTitle").font(LabnaTypography.headline)
                Text("checkout.demoMessage").font(LabnaTypography.body)
            }
        } icon: {
            Image(systemName: "testtube.2").font(.title2).accessibilityHidden(true)
        }
        .foregroundStyle(Color.labnaGreen)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(LabnaSpacing.medium)
        .background(Color.labnaMint, in: RoundedRectangle(cornerRadius: LabnaRadius.medium))
    }

    private var orderLines: some View {
        VStack(alignment: .leading, spacing: LabnaSpacing.medium) {
            Text("checkout.products").font(LabnaTypography.brand).foregroundStyle(Color.labnaInk)
            ForEach(container.cart.lines) { line in
                HStack(alignment: .top, spacing: LabnaSpacing.medium) {
                    ProductImage(url: line.product?.imageURLs.first)
                        .frame(width: 64)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    VStack(alignment: .leading, spacing: LabnaSpacing.extraSmall) {
                        Text((line.product?.name ?? line.item.productName).value(for: language))
                            .font(LabnaTypography.headline)
                        Text((line.variant?.label ?? line.item.variantLabel).value(for: language))
                            .font(LabnaTypography.caption)
                            .foregroundStyle(Color.labnaMuted)
                        Text("checkout.quantity \(line.item.quantity)")
                            .font(LabnaTypography.caption)
                            .foregroundStyle(Color.labnaMuted)
                    }
                    Spacer()
                    if let subtotal = line.currentSubtotalMinor {
                        PriceText(minorUnits: subtotal, currencyCode: line.item.currencyCode)
                    }
                }
                if line.id != container.cart.lines.last?.id { Divider() }
            }
        }
        .padding(LabnaSpacing.medium)
        .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.large))
        .overlay { RoundedRectangle(cornerRadius: LabnaRadius.large).stroke(Color.labnaBorder) }
    }

    private var notesField: some View {
        VStack(alignment: .leading, spacing: LabnaSpacing.small) {
            Text("checkout.notes").font(LabnaTypography.headline)
            TextEditor(text: $notes)
                .frame(minHeight: 100)
                .padding(LabnaSpacing.small)
                .scrollContentBackground(.hidden)
                .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.medium))
                .overlay { RoundedRectangle(cornerRadius: LabnaRadius.medium).stroke(Color.labnaBorder) }
                .accessibilityIdentifier("checkout.notes")
        }
    }

    private var totals: some View {
        VStack(spacing: LabnaSpacing.small) {
            HStack {
                Text("cart.units")
                Spacer()
                Text(container.cart.totalQuantity.formatted()).monospacedDigit()
            }
            HStack(alignment: .firstTextBaseline) {
                Text("cart.total").font(LabnaTypography.headline)
                Spacer()
                PriceText(minorUnits: container.cart.totalMinor, currencyCode: container.cart.currencyCode)
            }
        }
        .padding(LabnaSpacing.medium)
        .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.medium))
        .overlay { RoundedRectangle(cornerRadius: LabnaRadius.medium).stroke(Color.labnaBorder) }
    }

    private var confirmButton: some View {
        Button {
            guard !checkout.isProcessing else { return }
            Task {
                completedOrder = await checkout.confirm(cart: container.cart, notes: notes)
            }
        } label: {
            if checkout.isProcessing {
                HStack {
                    ProgressView().tint(.white)
                    Text("checkout.processing")
                }
            } else {
                Text("checkout.confirm")
            }
        }
        .buttonStyle(.labnaPrimary)
        .disabled(checkout.isProcessing || container.cart.items.isEmpty || container.cart.containsUnavailableItems)
        .accessibilityIdentifier("checkout.confirm")
    }
}

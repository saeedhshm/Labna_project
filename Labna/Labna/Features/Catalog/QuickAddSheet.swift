import SwiftUI

struct QuickAddSheet: View {
    let product: Product
    let language: AppLanguage
    let onAdded: (String) -> Void
    @Environment(AppContainer.self) private var container
    @Environment(\.dismiss) private var dismiss
    @State private var selectedVariantID: String?
    @State private var quantity = 1

    init(product: Product, language: AppLanguage, onAdded: @escaping (String) -> Void) {
        self.product = product
        self.language = language
        self.onAdded = onAdded
        _selectedVariantID = State(initialValue: product.variants.first(where: \.isAvailable)?.id)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: LabnaSpacing.large) {
                    HStack(alignment: .top, spacing: LabnaSpacing.medium) {
                        ProductImage(url: product.imageURLs.first)
                            .frame(width: 104)
                            .clipShape(RoundedRectangle(cornerRadius: LabnaRadius.medium))
                        VStack(alignment: .leading, spacing: LabnaSpacing.small) {
                            Text(product.name.value(for: language))
                                .font(LabnaTypography.brand)
                                .foregroundStyle(Color.labnaInk)
                            Text(product.description.value(for: language))
                                .font(LabnaTypography.body)
                                .foregroundStyle(Color.labnaMuted)
                                .lineLimit(3)
                        }
                    }
                    VariantSelector(variants: product.variants, selection: $selectedVariantID, language: language)
                    HStack {
                        Text("quantity.title").font(LabnaTypography.headline)
                        Spacer()
                        QuantityStepper(quantity: $quantity)
                    }
                }
                .padding(LabnaSpacing.large)
            }
            .background(Color.labnaCream.opacity(0.25))
            .navigationTitle("quickAdd.title")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("action.close") { dismiss() }
                }
            }
            .safeAreaInset(edge: .bottom) {
                addButton
                    .padding(LabnaSpacing.medium)
                    .background(.ultraThinMaterial)
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private var selectedVariant: ProductVariant? {
        product.variants.first { $0.id == selectedVariantID && $0.isAvailable }
    }

    private var addButton: some View {
        Button {
            guard let variant = selectedVariant else { return }
            container.cart.add(product: product, variant: variant, quantity: quantity)
            onAdded(product.name.value(for: language))
            dismiss()
        } label: {
            HStack {
                Text("product.addToCart")
                Spacer()
                if let variant = selectedVariant {
                    Text(PriceFormatter.string(
                        minorUnits: variant.priceMinor * quantity,
                        currencyCode: variant.currencyCode,
                        locale: language.locale
                    ))
                    .monospacedDigit()
                }
            }
        }
        .buttonStyle(.labnaPrimary)
        .disabled(selectedVariant == nil)
        .accessibilityIdentifier("quickAdd.confirm")
    }
}

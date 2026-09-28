import SwiftUI

struct ProductDetailsView: View {
    let product: Product
    let language: AppLanguage
    @Environment(AppContainer.self) private var container
    @State private var selectedVariantID: String?
    @State private var quantity = 1
    @State private var addedProductName: String?

    init(product: Product, language: AppLanguage) {
        self.product = product
        self.language = language
        _selectedVariantID = State(initialValue: product.variants.first(where: \.isAvailable)?.id)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LabnaSpacing.large) {
                imageGallery
                VStack(alignment: .leading, spacing: LabnaSpacing.medium) {
                    Text(product.name.value(for: language))
                        .font(LabnaTypography.title)
                        .foregroundStyle(Color.labnaInk)
                    Text(product.description.value(for: language))
                        .font(LabnaTypography.body)
                        .foregroundStyle(Color.labnaMuted)
                    VariantSelector(variants: product.variants, selection: $selectedVariantID, language: language)
                    HStack {
                        Text("quantity.title").font(LabnaTypography.headline)
                        Spacer()
                        QuantityStepper(quantity: $quantity)
                    }
                    productInformation
                }
                .padding(.horizontal, LabnaSpacing.large)
                .padding(.bottom, LabnaSpacing.large)
            }
        }
        .background(Color.white)
        .navigationTitle(product.name.value(for: language))
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            addButton.padding(LabnaSpacing.medium).background(.ultraThinMaterial)
        }
        .addedToCartToast(productName: addedProductName) { addedProductName = nil }
    }

    private var imageGallery: some View {
        TabView {
            ForEach(product.imageURLs, id: \.absoluteString) { url in
                ProductImage(url: url, aspectRatio: 1.12)
            }
        }
        .frame(minHeight: 330)
        .tabViewStyle(.page(indexDisplayMode: product.imageURLs.count > 1 ? .automatic : .never))
        .background(Color.labnaCream.opacity(0.4))
    }

    private var productInformation: some View {
        VStack(spacing: 0) {
            DisclosureGroup("product.ingredients") {
                Text(product.ingredients.value(for: language))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, LabnaSpacing.small)
            }
            .padding(.vertical, LabnaSpacing.medium)
            Divider()
            DisclosureGroup("product.storage") {
                Text(product.storageInstructions.value(for: language))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, LabnaSpacing.small)
            }
            .padding(.vertical, LabnaSpacing.medium)
        }
        .font(LabnaTypography.body)
        .tint(.labnaGreen)
    }

    private var selectedVariant: ProductVariant? {
        product.variants.first { $0.id == selectedVariantID && $0.isAvailable }
    }

    private var addButton: some View {
        Button {
            guard let variant = selectedVariant else { return }
            container.cart.add(product: product, variant: variant, quantity: quantity)
            addedProductName = product.name.value(for: language)
        } label: {
            HStack {
                Text(LocalizedStringKey(product.isAvailable ? "product.addToCart" : "product.unavailable"))
                Spacer()
                if let variant = selectedVariant {
                    Text(PriceFormatter.string(
                        minorUnits: variant.priceMinor * quantity,
                        currencyCode: variant.currencyCode,
                        locale: language.locale
                    )).monospacedDigit()
                }
            }
        }
        .buttonStyle(.labnaPrimary)
        .disabled(selectedVariant == nil)
        .accessibilityIdentifier("productDetails.add")
    }
}

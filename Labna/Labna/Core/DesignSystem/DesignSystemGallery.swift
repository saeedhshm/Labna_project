import SwiftUI

struct DesignSystemGallery: View {
    let language: AppLanguage
    @State private var search = ""
    @State private var quantity = 1
    @State private var selectedVariant: String? = PreviewFixtures.product.variants.first?.id
    @State private var toastProduct: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LabnaSpacing.large) {
                Text("brand.name").font(LabnaTypography.largeTitle).foregroundStyle(Color.labnaInk)
                LabnaSearchField(text: $search)

                section("gallery.buttons") {
                    Button("gallery.primary") {}
                        .buttonStyle(.labnaPrimary)
                    Button("gallery.secondary") {}
                        .buttonStyle(.labnaSecondary)
                }

                section("gallery.controls") {
                    VariantSelector(
                        variants: PreviewFixtures.product.variants,
                        selection: $selectedVariant,
                        language: language
                    )
                    QuantityStepper(quantity: $quantity)
                    PriceText(minorUnits: 1800, currencyCode: "EGP", prefix: "price.from")
                }

                section("gallery.cards") {
                    CategoryCard(category: PreviewFixtures.category, language: language) {}
                        .frame(maxWidth: 220)
                    ProductCard(
                        product: PreviewFixtures.product,
                        language: language,
                        openDetails: {},
                        addToCart: {
                            toastProduct = PreviewFixtures.product.name.value(for: language)
                        }
                    )
                    .frame(maxWidth: 240)
                }

                section("gallery.states") {
                    LabnaLoadingView().frame(height: 130)
                    LabnaEmptyStateView(
                        title: "empty.title",
                        message: "empty.message",
                        actionTitle: "empty.action",
                        action: {}
                    )
                    .frame(height: 300)
                    LabnaErrorStateView(message: "data.error.offline") {}
                        .frame(height: 300)
                }
            }
            .padding(LabnaSpacing.large)
        }
        .background(Color.labnaCream.opacity(0.35))
        .addedToCartToast(productName: toastProduct) { toastProduct = nil }
    }

    private func section<Content: View>(
        _ title: LocalizedStringKey,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: LabnaSpacing.medium) {
            Text(title).font(LabnaTypography.title).foregroundStyle(Color.labnaInk)
            content()
        }
    }
}

private enum PreviewFixtures {
    static let category = Category(
        id: "milk",
        name: LocalizedText(ar: "الحليب", en: "Milk"),
        imageURL: URL(string: "https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=800&q=80")!,
        sortOrder: 1
    )

    static let product = Product(
        id: "milk-full",
        categoryID: "milk",
        name: LocalizedText(ar: "حليب كامل الدسم", en: "Full Cream Milk"),
        description: LocalizedText(ar: "حليب بطعم غني.", en: "Rich-tasting milk."),
        imageURLs: [category.imageURL],
        ingredients: LocalizedText(ar: "حليب مبستر.", en: "Pasteurized milk."),
        storageInstructions: LocalizedText(ar: "يحفظ مبردًا.", en: "Keep refrigerated."),
        isFeatured: true,
        variants: [
            ProductVariant(id: "250", label: .init(ar: "250 مل", en: "250 ml"), quantity: 250, unit: .ml, priceMinor: 1800, currencyCode: "EGP", isAvailable: true),
            ProductVariant(id: "500", label: .init(ar: "500 مل", en: "500 ml"), quantity: 500, unit: .ml, priceMinor: 3000, currencyCode: "EGP", isAvailable: true),
            ProductVariant(id: "1000", label: .init(ar: "1 لتر", en: "1 litre"), quantity: 1000, unit: .ml, priceMinor: 5500, currencyCode: "EGP", isAvailable: false)
        ]
    )
}

#Preview("Design System — العربية") {
    DesignSystemGallery(language: .arabic)
        .environment(\.locale, AppLanguage.arabic.locale)
        .environment(\.layoutDirection, AppLanguage.arabic.layoutDirection)
        .preferredColorScheme(.light)
}

#Preview("Design System — English") {
    DesignSystemGallery(language: .english)
        .environment(\.locale, AppLanguage.english.locale)
        .environment(\.layoutDirection, AppLanguage.english.layoutDirection)
        .preferredColorScheme(.light)
}

#Preview("Design System — Large Text") {
    DesignSystemGallery(language: .english)
        .environment(\.locale, AppLanguage.english.locale)
        .environment(\.dynamicTypeSize, .accessibility3)
        .preferredColorScheme(.light)
}

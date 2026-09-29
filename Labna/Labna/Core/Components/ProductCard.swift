import SwiftUI

struct ProductCard: View {
    let product: Product
    let language: AppLanguage
    let openDetails: () -> Void
    let addToCart: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: LabnaSpacing.small) {
            VStack(alignment: .leading, spacing: LabnaSpacing.small) {
                ZStack(alignment: .topTrailing) {
                    Button(action: openDetails) {
                        ProductImage(url: product.imageURLs.first, allowsRetry: false)
                            .clipShape(RoundedRectangle(cornerRadius: LabnaRadius.medium))
                    }
                    .buttonStyle(.plain)
                    .accessibilityHidden(true)
                    FavoriteButton(productID: product.id)
                        .padding(LabnaSpacing.small)
                }

                Button(action: openDetails) {
                    VStack(alignment: .leading, spacing: LabnaSpacing.small) {
                        Text(product.name.value(for: language))
                            .font(LabnaTypography.headline)
                            .foregroundStyle(Color.labnaInk)
                            .lineLimit(2, reservesSpace: true)
                        price
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(detailsAccessibilityLabel)
                .accessibilityHint("product.open")
                .accessibilityIdentifier("product.\(product.id)")
            }

            Button(action: addToCart) {
                Label("product.add", systemImage: "plus")
                    .font(LabnaTypography.headline)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .tint(.labnaGreen)
            .disabled(!product.isAvailable)
            .accessibilityIdentifier("quickAdd.\(product.id)")
        }
        .padding(LabnaSpacing.small)
        .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.large))
        .overlay {
            RoundedRectangle(cornerRadius: LabnaRadius.large).stroke(Color.labnaBorder)
        }
    }

    @ViewBuilder
    private var price: some View {
        if let amount = product.startingPriceMinor,
           let currency = product.variants.first(where: \.isAvailable)?.currencyCode {
            PriceText(
                minorUnits: amount,
                currencyCode: currency,
                prefix: product.variants.filter(\.isAvailable).count > 1 ? "price.from" : nil
            )
        } else {
            Text("product.unavailable")
                .font(LabnaTypography.headline)
                .foregroundStyle(Color.labnaMuted)
        }
    }

    private var detailsAccessibilityLabel: String {
        let name = product.name.value(for: language)
        guard let amount = product.startingPriceMinor,
              let currency = product.variants.first(where: \.isAvailable)?.currencyCode else {
            return "\(name), \(String(localized: "product.unavailable", locale: language.locale))"
        }
        return "\(name), \(PriceFormatter.string(minorUnits: amount, currencyCode: currency, locale: language.locale))"
    }
}

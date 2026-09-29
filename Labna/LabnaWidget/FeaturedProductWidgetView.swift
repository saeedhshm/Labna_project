import SwiftUI
import UIKit
import WidgetKit

/// Brand look shared with the app: colours, radii and typography come from the
/// shared `Labna` design tokens, so the widget cannot drift from the app.
/// Reads the widget family from the environment. Kept separate from the layout
/// view so previews can render a specific family without a widget host.
struct FeaturedProductWidgetContainer: View {
    let entry: FeaturedProductEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        FeaturedProductWidgetView(entry: entry, family: family)
    }
}

struct FeaturedProductWidgetView: View {
    let entry: FeaturedProductEntry
    let family: WidgetFamily

    var body: some View {
        content
            .environment(\.layoutDirection, entry.language.layoutDirection)
            .containerBackground(for: .widget) { Color.labnaCream }
            .widgetURL(entry.deepLinkURL)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(verbatim: accessibilityText))
            .accessibilityAddTraits(.isButton)
    }

    @ViewBuilder
    private var content: some View {
        switch family {
        case .systemMedium:
            mediumLayout
        default:
            smallLayout
        }
    }

    // MARK: - Small: image, name, price only.

    private var smallLayout: some View {
        VStack(alignment: .leading, spacing: LabnaSpacing.small) {
            brandHeader
            productImage
                .frame(height: 56)
                .clipShape(RoundedRectangle(cornerRadius: LabnaRadius.medium))
            Text(verbatim: nameText)
                .font(LabnaTypography.headline)
                .foregroundStyle(Color.labnaInk)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
            Spacer(minLength: 0)
            priceText
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .padding(LabnaSpacing.small)
    }

    // MARK: - Medium: adds supporting text and the call to action.

    private var mediumLayout: some View {
        HStack(alignment: .top, spacing: LabnaSpacing.medium) {
            productImage
                .frame(width: 104)
            VStack(alignment: .leading, spacing: LabnaSpacing.small) {
                brandHeader
                Text(verbatim: nameText)
                    .font(LabnaTypography.headline)
                    .foregroundStyle(Color.labnaInk)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                if entry.product != nil {
                    Text(verbatim: SharedLocalized.string("widget.freshEveryDay", language: entry.language))
                        .font(LabnaTypography.caption)
                        .foregroundStyle(Color.labnaMuted)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                HStack(alignment: .center, spacing: LabnaSpacing.small) {
                    priceText
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        .layoutPriority(1)
                    Spacer(minLength: 0)
                    openAffordance
                }
            }
        }
        .padding(LabnaSpacing.medium)
    }

    // MARK: - Pieces

    private var brandHeader: some View {
        HStack(spacing: LabnaSpacing.extraSmall) {
            Image(systemName: "drop.fill")
                .font(.caption2)
                .foregroundStyle(Color.labnaGreen)
            Text(verbatim: SharedLocalized.string("widget.brand", language: entry.language))
                .font(LabnaTypography.caption)
                .foregroundStyle(Color.labnaMuted)
        }
    }

    @ViewBuilder
    private var productImage: some View {
        if let data = entry.imageData, let image = UIImage(data: data) {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: LabnaRadius.medium))
        } else {
            imagePlaceholder
        }
    }

    /// Always looks intentional, including with no network and no cached image.
    private var imagePlaceholder: some View {
        ZStack {
            Color.labnaMint
            Image(systemName: "drop.fill")
                .font(.title2)
                .foregroundStyle(Color.labnaGreen.opacity(0.55))
        }
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: LabnaRadius.medium))
    }

    private var nameText: String {
        entry.product?.name(for: entry.language)
            ?? SharedLocalized.string("widget.noProduct", language: entry.language)
    }

    @ViewBuilder
    private var priceText: some View {
        if let product = entry.product {
            Text(verbatim: pricePrefix + " " + formattedPrice(product))
                .font(LabnaTypography.price)
                .foregroundStyle(Color.labnaGreen)
        } else {
            Text(verbatim: SharedLocalized.string("widget.unavailable", language: entry.language))
                .font(LabnaTypography.caption)
                .foregroundStyle(Color.labnaMuted)
        }
    }

    private var pricePrefix: String {
        SharedLocalized.string("widget.from", language: entry.language)
    }

    private func formattedPrice(_ product: WidgetProductSnapshot) -> String {
        PriceFormatter.string(
            minorUnits: product.priceMinor,
            currencyCode: product.currencyCode,
            locale: entry.language.locale
        )
    }

    /// The whole widget is one tap target, so the medium family uses a compact
    /// affordance instead of a text call to action that would crowd the price.
    private var openAffordance: some View {
        Image(systemName: "arrow.forward")
            .font(.caption.bold())
            .foregroundStyle(Color.white)
            .frame(width: 28, height: 28)
            .background(Color.labnaGreen, in: Circle())
    }

    private var accessibilityText: String {
        guard let product = entry.product else { return nameText }
        return [
            SharedLocalized.string("widget.brand", language: entry.language),
            product.name(for: entry.language),
            pricePrefix + " " + formattedPrice(product),
            SharedLocalized.string("widget.viewProduct", language: entry.language)
        ].joined(separator: ", ")
    }
}

#Preview("Small") {
    FeaturedProductWidgetView(entry: WidgetPreviewData.entry(language: .english), family: .systemSmall)
        .frame(width: 158, height: 158)
        .background(Color.labnaCream)
}

#Preview("Medium Arabic") {
    FeaturedProductWidgetView(entry: WidgetPreviewData.entry(language: .arabic), family: .systemMedium)
        .frame(width: 338, height: 158)
        .background(Color.labnaCream)
}

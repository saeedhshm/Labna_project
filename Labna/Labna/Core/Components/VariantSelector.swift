import SwiftUI

struct VariantSelector: View {
    let variants: [ProductVariant]
    @Binding var selection: String?
    let language: AppLanguage

    var body: some View {
        VStack(alignment: .leading, spacing: LabnaSpacing.small) {
            Text("variant.title")
                .font(LabnaTypography.headline)
                .foregroundStyle(Color.labnaInk)

            ViewThatFits {
                HStack(spacing: LabnaSpacing.small) { options }
                VStack(spacing: LabnaSpacing.small) { options }
            }
        }
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private var options: some View {
        ForEach(variants) { variant in
            let isSelected = selection == variant.id
            Button {
                selection = variant.id
            } label: {
                VStack(spacing: LabnaSpacing.extraSmall) {
                    Text(variant.label.value(for: language))
                        .font(LabnaTypography.headline)
                    PriceText(
                        minorUnits: variant.priceMinor,
                        currencyCode: variant.currencyCode,
                        color: isSelected ? .white : .labnaGreen
                    )
                        .font(LabnaTypography.caption)
                    if !variant.isAvailable {
                        Text("product.unavailable")
                            .font(LabnaTypography.caption)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 72)
                .padding(.horizontal, LabnaSpacing.small)
                .foregroundStyle(isSelected ? Color.white : Color.labnaInk)
                .background(
                    isSelected ? Color.labnaGreen : Color.white,
                    in: RoundedRectangle(cornerRadius: LabnaRadius.medium)
                )
                .overlay {
                    RoundedRectangle(cornerRadius: LabnaRadius.medium)
                        .stroke(isSelected ? Color.labnaGreen : Color.labnaBorder)
                }
                .opacity(variant.isAvailable ? 1 : 0.48)
            }
            .buttonStyle(.plain)
            .disabled(!variant.isAvailable)
            .accessibilityLabel(variant.label.value(for: language))
            .accessibilityValue(
                isSelected ? String(localized: "variant.selected", locale: language.locale) : ""
            )
            .accessibilityIdentifier("variant.\(variant.id)")
        }
    }
}

import SwiftUI

struct PriceText: View {
    let minorUnits: Int
    let currencyCode: String
    var prefix: LocalizedStringKey?
    var color: Color = .labnaGreen
    @Environment(\.locale) private var locale

    var body: some View {
        HStack(spacing: LabnaSpacing.extraSmall) {
            if let prefix { Text(prefix).opacity(0.72) }
            Text(PriceFormatter.string(minorUnits: minorUnits, currencyCode: currencyCode, locale: locale))
        }
        .font(LabnaTypography.price)
        .foregroundStyle(color)
        .accessibilityElement(children: .combine)
    }
}

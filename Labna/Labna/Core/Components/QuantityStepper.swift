import SwiftUI

struct QuantityStepper: View {
    @Binding var quantity: Int
    var range: ClosedRange<Int> = 1...20

    var body: some View {
        HStack(spacing: LabnaSpacing.small) {
            control(symbol: "minus", label: "quantity.decrease", disabled: quantity <= range.lowerBound) {
                quantity = max(range.lowerBound, quantity - 1)
            }
            Text(quantity.formatted())
                .font(LabnaTypography.headline.monospacedDigit())
                .frame(minWidth: 32)
                .contentTransition(.numericText())
                .accessibilityLabel("quantity.value \(quantity)")
            control(symbol: "plus", label: "quantity.increase", disabled: quantity >= range.upperBound) {
                quantity = min(range.upperBound, quantity + 1)
            }
        }
        .padding(LabnaSpacing.extraSmall)
        .background(Color.labnaCream, in: Capsule())
        .accessibilityElement(children: .contain)
    }

    private func control(
        symbol: String,
        label: LocalizedStringKey,
        disabled: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.body.weight(.semibold))
                .frame(width: 40, height: 40)
                .background(Color.white, in: Circle())
        }
        .disabled(disabled)
        .accessibilityLabel(label)
    }
}

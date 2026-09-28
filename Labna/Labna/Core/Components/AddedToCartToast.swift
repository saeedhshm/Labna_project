import SwiftUI

struct AddedToCartToast: View {
    let productName: String

    var body: some View {
        Label {
            Text("cart.added \(productName)")
                .font(LabnaTypography.headline)
        } icon: {
            Image(systemName: "checkmark.circle.fill").accessibilityHidden(true)
        }
        .foregroundStyle(Color.white)
        .padding(.horizontal, LabnaSpacing.medium)
        .padding(.vertical, LabnaSpacing.small)
        .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
        .background(Color.labnaGreen, in: RoundedRectangle(cornerRadius: LabnaRadius.medium))
        .shadow(color: Color.black.opacity(0.08), radius: 12, y: 4)
        .accessibilityAddTraits(.isStaticText)
    }
}

extension View {
    func addedToCartToast(productName: String?, dismiss: @escaping () -> Void) -> some View {
        overlay(alignment: .top) {
            if let productName {
                AddedToCartToast(productName: productName)
                    .padding(LabnaSpacing.medium)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .task {
                        try? await Task.sleep(for: .seconds(2))
                        guard !Task.isCancelled else { return }
                        withAnimation { dismiss() }
                    }
            }
        }
        .animation(.spring(duration: 0.35), value: productName)
    }
}

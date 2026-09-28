import SwiftUI

struct OrderSuccessView: View {
    let order: DemoOrder
    let language: AppLanguage
    @Environment(AppContainer.self) private var container

    var body: some View {
        ScrollView {
            VStack(spacing: LabnaSpacing.large) {
                successHeader
                reference
                summary
                disclaimer
                actions
            }
            .padding(LabnaSpacing.large)
            .padding(.bottom, LabnaSpacing.extraLarge)
        }
        .background(Color.labnaCream.opacity(0.25))
        .navigationTitle("success.title")
        .navigationBarBackButtonHidden(true)
    }

    private var successHeader: some View {
        VStack(spacing: LabnaSpacing.medium) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 72))
                .foregroundStyle(Color.labnaGreen)
                .accessibilityHidden(true)
            Text("success.heading")
                .font(LabnaTypography.title)
                .foregroundStyle(Color.labnaInk)
                .multilineTextAlignment(.center)
                .accessibilityIdentifier("checkout.success")
        }
    }

    private var reference: some View {
        VStack(spacing: LabnaSpacing.extraSmall) {
            Text("success.reference")
                .font(LabnaTypography.caption)
                .foregroundStyle(Color.labnaMuted)
            Text(order.id)
                .font(.headline.monospaced())
                .textSelection(.enabled)
                .accessibilityIdentifier("success.reference")
        }
        .padding(LabnaSpacing.medium)
        .frame(maxWidth: .infinity)
        .background(Color.labnaMint, in: RoundedRectangle(cornerRadius: LabnaRadius.medium))
    }

    private var summary: some View {
        VStack(alignment: .leading, spacing: LabnaSpacing.medium) {
            Text("success.summary").font(LabnaTypography.brand)
            ForEach(Array(order.lines.enumerated()), id: \.offset) { _, line in
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: LabnaSpacing.extraSmall) {
                        Text(line.productName.value(for: language)).font(LabnaTypography.headline)
                        Text("\(line.variantLabel.value(for: language)) × \(line.quantity)")
                            .font(LabnaTypography.caption)
                            .foregroundStyle(Color.labnaMuted)
                    }
                    Spacer()
                    PriceText(minorUnits: line.subtotalMinor, currencyCode: order.currencyCode)
                }
            }
            Divider()
            HStack {
                Text("cart.total").font(LabnaTypography.headline)
                Spacer()
                PriceText(minorUnits: order.totalMinor, currencyCode: order.currencyCode)
            }
            if let notes = order.notes {
                Divider()
                VStack(alignment: .leading, spacing: LabnaSpacing.extraSmall) {
                    Text("checkout.notes").font(LabnaTypography.headline)
                    Text(notes).font(LabnaTypography.body).foregroundStyle(Color.labnaMuted)
                }
            }
        }
        .padding(LabnaSpacing.medium)
        .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.large))
        .overlay { RoundedRectangle(cornerRadius: LabnaRadius.large).stroke(Color.labnaBorder) }
    }

    private var disclaimer: some View {
        Text("success.disclaimer")
            .font(LabnaTypography.body)
            .foregroundStyle(Color.labnaMuted)
            .multilineTextAlignment(.center)
            .padding(.horizontal, LabnaSpacing.medium)
            .accessibilityIdentifier("success.disclaimer")
    }

    private var actions: some View {
        VStack(spacing: LabnaSpacing.small) {
            Button("success.home") { container.router.show(.home) }
                .buttonStyle(.labnaPrimary)
                .accessibilityIdentifier("success.home")
            Button("success.products") { container.router.show(.catalog) }
                .buttonStyle(.labnaSecondary)
                .accessibilityIdentifier("success.products")
        }
    }
}

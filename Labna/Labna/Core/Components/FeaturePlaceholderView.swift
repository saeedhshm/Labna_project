import SwiftUI

struct FeaturePlaceholderView: View {
    let title: LocalizedStringKey
    let message: LocalizedStringKey
    let symbol: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LabnaSpacing.extraLarge) {
                brandHeader
                contentCard
            }
            .padding(LabnaSpacing.large)
        }
        .background(Color.labnaCream.opacity(0.45))
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var contentCard: some View {
        VStack(alignment: .leading, spacing: LabnaSpacing.medium) {
            Image(systemName: symbol)
                .font(.system(size: 32, weight: .medium))
                .foregroundStyle(Color.labnaGreen)
                .frame(width: 64, height: 64)
                .background(
                    Color.labnaMint,
                    in: RoundedRectangle(cornerRadius: LabnaRadius.medium)
                )

            Text(title)
                .font(LabnaTypography.title)
                .foregroundStyle(Color.labnaInk)

            Text(message)
                .font(LabnaTypography.body)
                .foregroundStyle(.secondary)
                .lineSpacing(4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(LabnaSpacing.large)
        .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.large))
        .overlay {
            RoundedRectangle(cornerRadius: LabnaRadius.large)
                .stroke(Color.labnaGreen.opacity(0.08))
        }
    }

    private var brandHeader: some View {
        HStack(spacing: LabnaSpacing.small) {
            Image("LabnaLauncherLogo")
                .resizable()
                .scaledToFill()
                .frame(width: 24, height: 24)
                .clipShape(RoundedRectangle(cornerRadius: 7))

            VStack(alignment: .leading, spacing: 1) {
                Text("brand.name")
                    .font(LabnaTypography.brand)
                    .foregroundStyle(Color.labnaInk)
                Text("brand.tagline")
                    .font(LabnaTypography.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

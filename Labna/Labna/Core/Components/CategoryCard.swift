import SwiftUI

struct CategoryCard: View {
    let category: Category
    let language: AppLanguage
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: LabnaSpacing.small) {
                ProductImage(url: category.imageURL, aspectRatio: 1.25, allowsRetry: false)
                    .clipShape(RoundedRectangle(cornerRadius: LabnaRadius.medium))
                Text(category.name.value(for: language))
                    .font(LabnaTypography.headline)
                    .foregroundStyle(Color.labnaInk)
                    .lineLimit(2)
            }
            .padding(LabnaSpacing.small)
            .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.large))
            .overlay {
                RoundedRectangle(cornerRadius: LabnaRadius.large).stroke(Color.labnaBorder)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(category.name.value(for: language))
        .accessibilityHint("category.open")
    }
}

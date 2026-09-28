import SwiftUI

struct LabnaLogo: View {
    var body: some View {
        HStack(spacing: LabnaSpacing.small) {
            Image(systemName: "drop.fill")
                .font(.title2)
                .foregroundStyle(Color.labnaGreen)
                .frame(width: 44, height: 44)
                .background(Color.labnaMint, in: RoundedRectangle(cornerRadius: 14))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                Text("brand.name").font(LabnaTypography.brand).foregroundStyle(Color.labnaInk)
                Text("brand.tagline").font(LabnaTypography.caption).foregroundStyle(Color.labnaMuted)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

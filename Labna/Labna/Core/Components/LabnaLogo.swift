import SwiftUI

struct LabnaLogo: View {
    var body: some View {
        HStack(spacing: LabnaSpacing.small) {
            Image("LabnaLauncherLogo")
                .resizable()
                .scaledToFill()
                .frame(width: 44, height: 44)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                Text("brand.name").font(LabnaTypography.brand).foregroundStyle(Color.labnaInk)
                Text("brand.tagline").font(LabnaTypography.caption).foregroundStyle(Color.labnaMuted)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

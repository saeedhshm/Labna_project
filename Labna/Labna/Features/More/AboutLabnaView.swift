import SwiftUI

struct AboutLabnaView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LabnaSpacing.large) {
                VStack(alignment: .leading, spacing: LabnaSpacing.medium) {
                    LabnaLogo()
                    Text("about.lead")
                        .font(LabnaTypography.title)
                        .foregroundStyle(Color.labnaInk)
                    Text("about.body")
                        .font(LabnaTypography.body)
                        .foregroundStyle(Color.labnaMuted)
                }
                .padding(LabnaSpacing.large)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.large))
                .overlay { RoundedRectangle(cornerRadius: LabnaRadius.large).stroke(Color.labnaBorder) }

                infoCard(
                    title: "about.catalog.title",
                    message: "about.catalog.message",
                    symbol: "shippingbox"
                )
                infoCard(
                    title: "about.bilingual.title",
                    message: "about.bilingual.message",
                    symbol: "character.bubble"
                )
                infoCard(
                    title: "about.demo.title",
                    message: "about.demo.message",
                    symbol: "testtube.2"
                )
            }
            .padding(LabnaSpacing.large)
        }
        .background(Color.labnaCream.opacity(0.45))
        .navigationTitle("more.aboutLabna")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func infoCard(
        title: LocalizedStringKey,
        message: LocalizedStringKey,
        symbol: String
    ) -> some View {
        HStack(alignment: .top, spacing: LabnaSpacing.medium) {
            Image(systemName: symbol)
                .font(.title2)
                .foregroundStyle(Color.labnaGreen)
                .frame(width: 46, height: 46)
                .background(Color.labnaMint, in: RoundedRectangle(cornerRadius: 14))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: LabnaSpacing.extraSmall) {
                Text(title).font(LabnaTypography.headline).foregroundStyle(Color.labnaInk)
                Text(message).font(LabnaTypography.body).foregroundStyle(Color.labnaMuted)
            }
        }
        .padding(LabnaSpacing.medium)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.medium))
        .overlay { RoundedRectangle(cornerRadius: LabnaRadius.medium).stroke(Color.labnaBorder) }
    }
}

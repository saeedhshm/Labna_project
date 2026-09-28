import SwiftUI

struct ContactView: View {
    var body: some View {
        ScrollView {
            VStack(spacing: LabnaSpacing.large) {
                Image(systemName: "bubble.left.and.bubble.right.fill")
                    .font(.system(size: 52))
                    .foregroundStyle(Color.labnaGreen)
                    .frame(width: 96, height: 96)
                    .background(Color.labnaMint, in: Circle())
                    .accessibilityHidden(true)

                VStack(spacing: LabnaSpacing.small) {
                    Text("contact.heading")
                        .font(LabnaTypography.title)
                        .foregroundStyle(Color.labnaInk)
                    Text("contact.message")
                        .font(LabnaTypography.body)
                        .foregroundStyle(Color.labnaMuted)
                        .multilineTextAlignment(.center)
                }

                Label {
                    Text("contact.demoMessage")
                        .font(LabnaTypography.body)
                } icon: {
                    Image(systemName: "info.circle.fill")
                }
                .foregroundStyle(Color.labnaGreen)
                .padding(LabnaSpacing.medium)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.labnaMint, in: RoundedRectangle(cornerRadius: LabnaRadius.medium))
                .accessibilityIdentifier("contact.demoNotice")
            }
            .padding(LabnaSpacing.large)
        }
        .background(Color.labnaCream.opacity(0.45))
        .navigationTitle("more.contact")
        .navigationBarTitleDisplayMode(.inline)
    }
}

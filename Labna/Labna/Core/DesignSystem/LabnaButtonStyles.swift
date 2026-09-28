import SwiftUI

struct LabnaPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(LabnaTypography.headline)
            .frame(maxWidth: .infinity, minHeight: 52)
            .padding(.horizontal, LabnaSpacing.medium)
            .foregroundStyle(Color.white)
            .background(
                configuration.isPressed ? Color.labnaGreen.opacity(0.82) : Color.labnaGreen,
                in: RoundedRectangle(cornerRadius: LabnaRadius.medium)
            )
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .opacity(isEnabled ? 1 : 0.45)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

struct LabnaSecondaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(LabnaTypography.headline)
            .frame(maxWidth: .infinity, minHeight: 52)
            .padding(.horizontal, LabnaSpacing.medium)
            .foregroundStyle(Color.labnaGreen)
            .background(
                configuration.isPressed ? Color.labnaMint : Color.white,
                in: RoundedRectangle(cornerRadius: LabnaRadius.medium)
            )
            .overlay {
                RoundedRectangle(cornerRadius: LabnaRadius.medium)
                    .stroke(Color.labnaBorder)
            }
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .opacity(isEnabled ? 1 : 0.45)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == LabnaPrimaryButtonStyle {
    static var labnaPrimary: LabnaPrimaryButtonStyle { LabnaPrimaryButtonStyle() }
}

extension ButtonStyle where Self == LabnaSecondaryButtonStyle {
    static var labnaSecondary: LabnaSecondaryButtonStyle { LabnaSecondaryButtonStyle() }
}

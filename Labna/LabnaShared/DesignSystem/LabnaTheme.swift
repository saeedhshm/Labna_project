import SwiftUI

extension Color {
    static let labnaGreen = Color(red: 0.08, green: 0.31, blue: 0.23)
    static let labnaMint = Color(red: 0.91, green: 0.96, blue: 0.92)
    static let labnaCream = Color(red: 0.98, green: 0.97, blue: 0.93)
    static let labnaInk = Color(red: 0.10, green: 0.14, blue: 0.12)
    static let labnaBorder = Color.labnaGreen.opacity(0.12)
    static let labnaMuted = Color(red: 0.39, green: 0.43, blue: 0.40)
}

enum LabnaSpacing {
    static let extraSmall: CGFloat = 4
    static let small: CGFloat = 8
    static let medium: CGFloat = 16
    static let large: CGFloat = 24
    static let extraLarge: CGFloat = 32
}

enum LabnaRadius {
    static let medium: CGFloat = 16
    static let large: CGFloat = 24
}

enum LabnaTypography {
    static let largeTitle: Font = .largeTitle.bold()
    static let title: Font = .title.bold()
    static let brand: Font = .title2.bold()
    static let headline: Font = .headline
    static let body: Font = .body
    static let price: Font = .headline.monospacedDigit()
    static let caption: Font = .caption
}

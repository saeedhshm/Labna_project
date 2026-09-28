import SwiftUI

enum AppLanguage: String, CaseIterable, Identifiable {
    case arabic = "ar"
    case english = "en"

    var id: String { rawValue }
    var locale: Locale { Locale(identifier: rawValue) }

    var layoutDirection: LayoutDirection {
        self == .arabic ? .rightToLeft : .leftToRight
    }

    var titleKey: LocalizedStringKey {
        switch self {
        case .arabic: "language.arabic"
        case .english: "language.english"
        }
    }
}

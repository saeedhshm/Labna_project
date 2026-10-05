import SwiftUI

enum AppLanguage: String, CaseIterable, Identifiable, Codable, Sendable {
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

    /// The `locale` query value the API expects. Its raw value already matches,
    /// so this stays a single named mapping rather than a bare `rawValue` at
    /// each call site.
    var apiLocale: String { rawValue }
}

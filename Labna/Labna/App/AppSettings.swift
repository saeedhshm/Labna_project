import Foundation
import Observation

@Observable
final class AppSettings {
    private static let languageKey = "selectedLanguage"
    private let storage: UserDefaults?

    /// Invoked after the persisted language changes, so collaborators such as the
    /// widget snapshot publisher can react without polling.
    var onLanguageChange: ((AppLanguage) -> Void)?

    var language: AppLanguage {
        didSet {
            storage?.set(language.rawValue, forKey: Self.languageKey)
            guard language != oldValue else { return }
            onLanguageChange?(language)
        }
    }

    init(storage: UserDefaults? = .standard) {
        self.storage = storage

        if let savedValue = storage?.string(forKey: Self.languageKey),
           let savedLanguage = AppLanguage(rawValue: savedValue) {
            language = savedLanguage
        } else {
            language = Locale.preferredLanguages.first?.hasPrefix("ar") == true ? .arabic : .english
        }
    }
}

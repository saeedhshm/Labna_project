import Foundation
import Observation

@Observable
final class AppSettings {
    private static let languageKey = "selectedLanguage"
    private let storage: UserDefaults?

    var language: AppLanguage {
        didSet {
            storage?.set(language.rawValue, forKey: Self.languageKey)
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

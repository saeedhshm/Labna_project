import Foundation

/// Resolves a string in an explicit language.
///
/// The widget renders in the language chosen inside Labna, not the device
/// language, so strings are resolved with an explicit `Locale` and rendered
/// as `verbatim` text to avoid a second round of implicit localization.
enum SharedLocalized {
    static func string(_ key: String, language: AppLanguage, bundle: Bundle = .main) -> String {
        String(localized: String.LocalizationValue(key), bundle: bundle, locale: language.locale)
    }
}

import Foundation

struct LocalizedText: Codable, Hashable {
    let ar: String
    let en: String

    func value(for language: AppLanguage) -> String {
        language == .arabic ? ar : en
    }
}

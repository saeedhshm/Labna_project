import Foundation

enum PriceFormatter {
    nonisolated static func string(minorUnits: Int, currencyCode: String, locale: Locale) -> String {
        let amount = Decimal(minorUnits) / 100
        return amount.formatted(.currency(code: currencyCode).locale(locale))
    }
}

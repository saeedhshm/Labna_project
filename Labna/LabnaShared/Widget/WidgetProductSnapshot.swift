import Foundation

/// The minimal representation of a product that the widget needs.
///
/// Only fields required to render the widget are stored; the full `Product`
/// domain object is never serialized into shared storage.
nonisolated struct WidgetProductSnapshot: Codable, Equatable, Hashable, Sendable {
    let id: String
    let nameAR: String
    let nameEN: String
    let priceMinor: Int
    let currencyCode: String
    let imageURL: URL?
    /// Name of the image cached inside the App Group, when one is available.
    /// A cached copy keeps the widget reliable without network access.
    let cachedImageName: String?
    let updatedAt: Date

    init(
        id: String,
        nameAR: String,
        nameEN: String,
        priceMinor: Int,
        currencyCode: String,
        imageURL: URL?,
        cachedImageName: String? = nil,
        updatedAt: Date
    ) {
        self.id = id
        self.nameAR = nameAR
        self.nameEN = nameEN
        self.priceMinor = priceMinor
        self.currencyCode = currencyCode
        self.imageURL = imageURL
        self.cachedImageName = cachedImageName
        self.updatedAt = updatedAt
    }

    func name(for language: AppLanguage) -> String {
        language == .arabic ? nameAR : nameEN
    }

    /// A value that changes only when the rendered widget content changes.
    /// Used to avoid pointless `WidgetCenter` reloads.
    var contentSignature: String {
        [
            id,
            nameAR,
            nameEN,
            String(priceMinor),
            currencyCode,
            imageURL?.absoluteString ?? "-",
            cachedImageName ?? "-"
        ].joined(separator: "|")
    }
}

/// Everything the widget reads from shared storage.
///
/// Language lives beside the product so the widget renders in the language the
/// user picked inside Labna, even before a snapshot exists.
nonisolated struct WidgetSharedState: Codable, Equatable, Hashable, Sendable {
    static let fallbackLanguage: AppLanguage = .english

    var language: AppLanguage
    var featuredProduct: WidgetProductSnapshot?
    var updatedAt: Date

    init(language: AppLanguage, featuredProduct: WidgetProductSnapshot?, updatedAt: Date) {
        self.language = language
        self.featuredProduct = featuredProduct
        self.updatedAt = updatedAt
    }

    var signature: String {
        [language.rawValue, featuredProduct?.contentSignature ?? "-"].joined(separator: "|")
    }
}

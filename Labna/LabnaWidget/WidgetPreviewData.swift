import Foundation

/// Sample data for SwiftUI previews of the widget views.
///
/// Deliberately isolated from the production App Group storage so previews never
/// read or write real shared state. The timeline provider carries its own
/// placeholder copy so the Widget Gallery works without the app installed.
enum WidgetPreviewData {
    static let englishProduct = WidgetProductSnapshot(
        id: "milk-full",
        nameAR: "لبن كامل الدسم",
        nameEN: "Full Cream Milk",
        priceMinor: 4500,
        currencyCode: "EGP",
        imageURL: URL(string: "https://example.com/milk.jpg"),
        cachedImageName: nil,
        updatedAt: Date(timeIntervalSince1970: 1_700_000_000)
    )

    static let arabicProduct = WidgetProductSnapshot(
        id: "yogurt-greek",
        nameAR: "زبادي يوناني",
        nameEN: "Greek Yogurt",
        priceMinor: 2000,
        currencyCode: "EGP",
        imageURL: nil,
        cachedImageName: nil,
        updatedAt: Date(timeIntervalSince1970: 1_700_000_000)
    )

    static func entry(language: AppLanguage) -> FeaturedProductEntry {
        FeaturedProductEntry(
            date: Date(),
            language: language,
            product: language == .arabic ? arabicProduct : englishProduct,
            imageData: nil
        )
    }
}

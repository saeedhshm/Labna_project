import Foundation

enum ProductSortOption: String, CaseIterable, Identifiable {
    case featured, name, priceLowToHigh, priceHighToLow
    var id: String { rawValue }

    var titleKey: String {
        switch self {
        case .featured: "sort.featured"
        case .name: "sort.name"
        case .priceLowToHigh: "sort.priceLow"
        case .priceHighToLow: "sort.priceHigh"
        }
    }
}

enum CatalogQuery {
    static func products(
        from products: [Product],
        searchText: String,
        categoryID: String?,
        sort: ProductSortOption,
        language: AppLanguage
    ) -> [Product] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
            .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: language.locale)
        let filtered = products.filter { product in
            let matchesCategory = categoryID == nil || product.categoryID == categoryID
            guard matchesCategory, !query.isEmpty else { return matchesCategory }
            let searchable = [product.name, product.description, product.ingredients]
                .map { $0.value(for: language) }
                .joined(separator: " ")
                .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: language.locale)
            return searchable.contains(query)
        }
        return filtered.sorted { lhs, rhs in
            switch sort {
            case .featured:
                if lhs.isFeatured != rhs.isFeatured { return lhs.isFeatured && !rhs.isFeatured }
                return compareNames(lhs, rhs, language: language)
            case .name:
                return compareNames(lhs, rhs, language: language)
            case .priceLowToHigh:
                return comparePrices(lhs, rhs, ascending: true, language: language)
            case .priceHighToLow:
                return comparePrices(lhs, rhs, ascending: false, language: language)
            }
        }
    }

    private static func compareNames(_ lhs: Product, _ rhs: Product, language: AppLanguage) -> Bool {
        lhs.name.value(for: language).compare(
            rhs.name.value(for: language),
            options: [.caseInsensitive, .diacriticInsensitive],
            range: nil,
            locale: language.locale
        ) == .orderedAscending
    }

    private static func comparePrices(
        _ lhs: Product,
        _ rhs: Product,
        ascending: Bool,
        language: AppLanguage
    ) -> Bool {
        switch (lhs.startingPriceMinor, rhs.startingPriceMinor) {
        case let (left?, right?) where left != right:
            return ascending ? left < right : left > right
        case (_?, nil): return true
        case (nil, _?): return false
        default: return compareNames(lhs, rhs, language: language)
        }
    }
}

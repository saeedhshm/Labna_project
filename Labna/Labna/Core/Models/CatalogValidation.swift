import Foundation

enum CatalogValidationError: Error, Equatable {
    case duplicateID(String)
    case emptyLocalizedText(String)
    case invalidImageURL(String)
    case invalidProductCategory(String)
    case invalidVariantCount(String)
    case invalidVariant(String)
    case emptyCatalog
    case invalidBannerDestination(String)
    case invalidBranch(String)
}

enum CatalogValidator {
    static func validate(_ snapshot: CatalogSnapshot) throws {
        guard !snapshot.products.isEmpty, !snapshot.categories.isEmpty else {
            throw CatalogValidationError.emptyCatalog
        }
        try validateUnique(snapshot.categories.map(\.id), label: "category")
        try validateUnique(snapshot.products.map(\.id), label: "product")
        try validateUnique(snapshot.banners.map(\.id), label: "banner")
        try validateUnique(snapshot.branches.map(\.id), label: "branch")

        let categoryIDs = Set(snapshot.categories.map(\.id))
        let productIDs = Set(snapshot.products.map(\.id))
        let variants = snapshot.products.flatMap(\.variants)
        try validateUnique(variants.map(\.id), label: "variant")

        for category in snapshot.categories {
            try validate(category.name, label: "category.\(category.id).name")
            try validate(category.imageURL, label: "category.\(category.id).imageURL")
        }

        for product in snapshot.products {
            guard categoryIDs.contains(product.categoryID) else {
                throw CatalogValidationError.invalidProductCategory(product.id)
            }
            guard (1...3).contains(product.variants.count) else {
                throw CatalogValidationError.invalidVariantCount(product.id)
            }
            guard !product.imageURLs.isEmpty else {
                throw CatalogValidationError.invalidImageURL(product.id)
            }
            try product.imageURLs.forEach { try validate($0, label: product.id) }
            try [product.name, product.description, product.ingredients, product.storageInstructions].forEach {
                try validate($0, label: product.id)
            }
            for variant in product.variants {
                try validate(variant.label, label: "variant.\(variant.id).label")
                guard variant.priceMinor > 0, variant.quantity > 0, !variant.currencyCode.isEmpty else {
                    throw CatalogValidationError.invalidVariant(variant.id)
                }
            }
        }

        for banner in snapshot.banners {
            try validate(banner.title, label: "banner.\(banner.id).title")
            try validate(banner.subtitle, label: "banner.\(banner.id).subtitle")
            try validate(banner.imageURL, label: "banner.\(banner.id).imageURL")
            switch banner.destination.kind {
            case .category where !categoryIDs.contains(banner.destination.id):
                throw CatalogValidationError.invalidBannerDestination(banner.id)
            case .product where !productIDs.contains(banner.destination.id):
                throw CatalogValidationError.invalidBannerDestination(banner.id)
            default:
                break
            }
        }

        for branch in snapshot.branches {
            try validate(branch.name, label: "branch.\(branch.id).name")
            try validate(branch.address, label: "branch.\(branch.id).address")
            guard (-90...90).contains(branch.coordinate.latitude),
                  (-180...180).contains(branch.coordinate.longitude),
                  TimeZone(identifier: branch.timeZoneIdentifier) != nil else {
                throw CatalogValidationError.invalidBranch(branch.id)
            }
        }
    }

    private static func validateUnique(_ ids: [String], label: String) throws {
        var seen = Set<String>()
        for id in ids {
            guard !id.isEmpty, seen.insert(id).inserted else {
                throw CatalogValidationError.duplicateID("\(label):\(id)")
            }
        }
    }

    private static func validate(_ text: LocalizedText, label: String) throws {
        guard !text.ar.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !text.en.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw CatalogValidationError.emptyLocalizedText(label)
        }
    }

    private static func validate(_ url: URL, label: String) throws {
        guard url.scheme == "https", url.host != nil else {
            throw CatalogValidationError.invalidImageURL(label)
        }
    }
}

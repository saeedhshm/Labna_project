import Foundation
import SwiftData

@Model
final class PersistedCatalogProduct {
    @Attribute(.unique) var id: String
    var categoryID: String
    var nameAR: String
    var nameEN: String
    var descriptionAR: String
    var descriptionEN: String
    var imageURLStrings: [String]
    var ingredientsAR: String
    var ingredientsEN: String
    var storageAR: String
    var storageEN: String
    var isFeatured: Bool
    /// Retained only so existing stores keep a valid schema. The API has no
    /// such field, so it is never populated from the catalog.
    /// Retained only so existing stores keep a valid schema. The API has no
    /// such field, so it is never populated from the catalog.
    var isDemo: Bool
    var cacheOrder: Int

    init(_ product: Product, cacheOrder: Int) {
        id = product.id
        categoryID = product.categoryID
        nameAR = product.name.ar
        nameEN = product.name.en
        descriptionAR = product.description.ar
        descriptionEN = product.description.en
        imageURLStrings = product.imageURLs.map(\.absoluteString)
        ingredientsAR = product.ingredients.ar
        ingredientsEN = product.ingredients.en
        storageAR = product.storageInstructions.ar
        storageEN = product.storageInstructions.en
        isFeatured = product.isFeatured
        isDemo = false
        self.cacheOrder = cacheOrder
    }

    func domain(variants: [ProductVariant]) throws -> Product {
        try Product(
            id: id,
            categoryID: categoryID,
            name: LocalizedText(ar: nameAR, en: nameEN),
            description: LocalizedText(ar: descriptionAR, en: descriptionEN),
            imageURLs: imageURLStrings.map { try Self.url($0) },
            ingredients: LocalizedText(ar: ingredientsAR, en: ingredientsEN),
            storageInstructions: LocalizedText(ar: storageAR, en: storageEN),
            isFeatured: isFeatured,
            variants: variants
        )
    }

    private static func url(_ value: String) throws -> URL {
        guard let url = URL(string: value) else { throw CatalogError.invalidData(.products) }
        return url
    }
}

@Model
final class PersistedCatalogVariant {
    @Attribute(.unique) var id: String
    var productID: String
    var labelAR: String
    var labelEN: String
    var quantity: Int
    var unitRawValue: String
    var priceMinor: Int
    var currencyCode: String
    var isAvailable: Bool
    var cacheOrder: Int

    init(productID: String, variant: ProductVariant, cacheOrder: Int) {
        id = variant.id
        self.productID = productID
        labelAR = variant.label.ar
        labelEN = variant.label.en
        quantity = variant.quantity
        unitRawValue = variant.unit.rawValue
        priceMinor = variant.priceMinor
        currencyCode = variant.currencyCode
        isAvailable = variant.isAvailable
        self.cacheOrder = cacheOrder
    }

    var domain: ProductVariant? {
        guard let unit = ProductVariant.Unit(rawValue: unitRawValue) else { return nil }
        return ProductVariant(
            id: id,
            label: LocalizedText(ar: labelAR, en: labelEN),
            quantity: quantity,
            unit: unit,
            priceMinor: priceMinor,
            currencyCode: currencyCode,
            isAvailable: isAvailable
        )
    }
}

@Model
final class PersistedCatalogCategory {
    @Attribute(.unique) var id: String
    var nameAR: String
    var nameEN: String
    var imageURLString: String
    var sortOrder: Int
    var cacheOrder: Int

    init(_ category: Category, cacheOrder: Int) {
        id = category.id
        nameAR = category.name.ar
        nameEN = category.name.en
        imageURLString = category.imageURL.absoluteString
        sortOrder = category.sortOrder
        self.cacheOrder = cacheOrder
    }

    var domain: Category? {
        guard let imageURL = URL(string: imageURLString) else { return nil }
        return Category(id: id, name: LocalizedText(ar: nameAR, en: nameEN), imageURL: imageURL, sortOrder: sortOrder)
    }
}

@Model
final class PersistedCatalogBanner {
    @Attribute(.unique) var id: String
    var titleAR: String
    var titleEN: String
    var subtitleAR: String
    var subtitleEN: String
    var imageURLString: String
    var destinationKindRawValue: String
    var destinationID: String
    var sortOrder: Int
    var cacheOrder: Int

    init(_ banner: Banner, cacheOrder: Int) {
        id = banner.id
        titleAR = banner.title.ar
        titleEN = banner.title.en
        subtitleAR = banner.subtitle.ar
        subtitleEN = banner.subtitle.en
        imageURLString = banner.imageURL.absoluteString
        destinationKindRawValue = banner.destination.kind.rawValue
        destinationID = banner.destination.id
        sortOrder = banner.sortOrder
        self.cacheOrder = cacheOrder
    }

    var domain: Banner? {
        guard let imageURL = URL(string: imageURLString),
              let kind = Banner.Destination.Kind(rawValue: destinationKindRawValue) else { return nil }
        return Banner(
            id: id,
            title: LocalizedText(ar: titleAR, en: titleEN),
            subtitle: LocalizedText(ar: subtitleAR, en: subtitleEN),
            imageURL: imageURL,
            destination: Banner.Destination(kind: kind, id: destinationID),
            sortOrder: sortOrder
        )
    }
}

@Model
final class PersistedCatalogBranch {
    @Attribute(.unique) var id: String
    var nameAR: String
    var nameEN: String
    var addressAR: String
    var addressEN: String
    var latitude: Double
    var longitude: Double
    var timeZoneIdentifier: String
    var openingHoursData: Data
    var phoneNumber: String?
    var isDemo: Bool
    var cacheOrder: Int

    init(_ branch: Branch, cacheOrder: Int) throws {
        id = branch.id
        nameAR = branch.name.ar
        nameEN = branch.name.en
        addressAR = branch.address.ar
        addressEN = branch.address.en
        latitude = branch.coordinate.latitude
        longitude = branch.coordinate.longitude
        timeZoneIdentifier = branch.timeZoneIdentifier
        openingHoursData = try JSONEncoder().encode(branch.openingHours)
        phoneNumber = branch.phoneNumber
        isDemo = false
        self.cacheOrder = cacheOrder
    }

    var domain: Branch? {
        guard let openingHours = try? JSONDecoder().decode([Branch.OpeningHours].self, from: openingHoursData) else { return nil }
        return Branch(
            id: id,
            name: LocalizedText(ar: nameAR, en: nameEN),
            address: LocalizedText(ar: addressAR, en: addressEN),
            coordinate: Branch.Coordinate(latitude: latitude, longitude: longitude),
            timeZoneIdentifier: timeZoneIdentifier,
            openingHours: openingHours,
            phoneNumber: phoneNumber
        )
    }
}

@Model
final class PersistedCatalogMetadata {
    @Attribute(.unique) var key: String
    var lastSuccessfulSync: Date?

    init(key: String = "catalog", lastSuccessfulSync: Date?) {
        self.key = key
        self.lastSuccessfulSync = lastSuccessfulSync
    }

    static let catalogKey = "catalog"
}

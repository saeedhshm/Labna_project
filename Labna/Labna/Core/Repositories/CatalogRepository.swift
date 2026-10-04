import Foundation

@MainActor
protocol CatalogRepository {
    func fetchProducts() async throws -> [Product]
    func fetchCategories() async throws -> [Category]
    func fetchBanners() async throws -> [Banner]
    func fetchBranches() async throws -> [Branch]
}

enum CatalogResource: String, CaseIterable {
    case products, categories, banners, branches
}

@MainActor
protocol CatalogDataSource {
    func data(for resource: CatalogResource) async throws -> Data
}

/// Both sources currently share the documented JSON contract. Map remote DTOs here
/// (or supply another CatalogRepository) if the eventual API uses a different shape.
struct JSONCatalogRepository: CatalogRepository {
    let source: any CatalogDataSource

    func fetchProducts() async throws -> [Product] {
        try await decode(.products)
    }

    func fetchCategories() async throws -> [Category] {
        try await decode(.categories)
    }

    func fetchBanners() async throws -> [Banner] {
        try await decode(.banners)
    }

    func fetchBranches() async throws -> [Branch] {
        try await decode(.branches)
    }

    private func decode<T: Decodable>(_ resource: CatalogResource) async throws -> T {
        let data = try await source.data(for: resource)
        try Task.checkCancellation()
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw CatalogError.invalidData(resource)
        }
    }
}

struct BackendCatalogRepository: CatalogRepository {
    let baseURL: URL
    let session: URLSession
    private let pageLimit = 100

    init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func fetchProducts() async throws -> [Product] {
        try await fetchPageList(path: "products", resource: .products, queryItems: [
            URLQueryItem(name: "limit", value: String(pageLimit)),
            URLQueryItem(name: "locale", value: "en"),
        ], decode: ProductDTO.self).map(\.domain)
    }

    func fetchCategories() async throws -> [Category] {
        try await fetchPageList(path: "categories", resource: .categories, queryItems: [URLQueryItem(name: "limit", value: String(pageLimit))], decode: CategoryDTO.self).map(\.domain)
    }

    func fetchBanners() async throws -> [Banner] {
        try await fetchPageList(path: "banners", resource: .banners, queryItems: [URLQueryItem(name: "limit", value: String(pageLimit))], decode: BannerDTO.self).compactMap(\.domain)
    }

    func fetchBranches() async throws -> [Branch] {
        try await fetchPageList(path: "branches", resource: .branches, queryItems: [URLQueryItem(name: "limit", value: String(pageLimit))], decode: BranchDTO.self).map(\.domain)
    }

    private func fetchPageList<T: Decodable>(path: String, resource: CatalogResource, queryItems: [URLQueryItem], decode type: T.Type) async throws -> [T] {
        var all: [T] = []
        var cursor: String?
        repeat {
            var items = queryItems
            if let cursor { items.append(URLQueryItem(name: "cursor", value: cursor)) }
            let page: APIPage<T> = try await request(path: path, resource: resource, queryItems: items)
            all.append(contentsOf: page.data)
            cursor = page.meta.nextCursor
        } while cursor != nil
        return all
    }

    private func request<T: Decodable>(path: String, resource: CatalogResource, queryItems: [URLQueryItem]) async throws -> T {
        try Task.checkCancellation()
        guard baseURL.isAllowedCatalogAPIBaseURL, baseURL.query == nil, baseURL.fragment == nil else {
            throw CatalogError.invalidBaseURL
        }
        let url = baseURL.appendingPathComponent(path)
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            throw CatalogError.invalidBaseURL
        }
        components.queryItems = queryItems
        guard let requestURL = components.url else { throw CatalogError.invalidBaseURL }
        var request = URLRequest(url: requestURL)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 30
        do {
            let (data, response) = try await session.data(for: request)
            try Task.checkCancellation()
            guard let response = response as? HTTPURLResponse else { throw CatalogError.invalidResponse }
            guard (200..<300).contains(response.statusCode) else { throw CatalogError.httpStatus(response.statusCode) }
            do {
                return try JSONDecoder().decode(T.self, from: data)
            } catch {
                throw CatalogError.invalidData(resource)
            }
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as CatalogError {
            throw error
        } catch let error as URLError {
            if error.code == .cancelled { throw CancellationError() }
            throw CatalogError.network(error.code)
        }
    }
}

private struct APIPage<T: Decodable>: Decodable {
    struct Meta: Decodable {
        let nextCursor: String?
    }
    let data: [T]
    let meta: Meta
}

private struct ProductDTO: Decodable {
    let id: String
    let categoryID: String
    let name: LocalizedText
    let description: LocalizedText
    let imageURLs: [URL]
    let ingredients: LocalizedText
    let storageInstructions: LocalizedText
    let isFeatured: Bool
    let isDemo: Bool?
    let variants: [VariantDTO]

    var domain: Product {
        Product(id: id, categoryID: categoryID, name: name, description: description, imageURLs: imageURLs, ingredients: ingredients, storageInstructions: storageInstructions, isFeatured: isFeatured, isDemo: isDemo ?? false, variants: variants.map(\.domain))
    }
}

private struct VariantDTO: Decodable {
    let id: String
    let label: LocalizedText
    let quantity: Int
    let unit: ProductVariant.Unit
    let priceMinor: Int
    let currencyCode: String
    let isAvailable: Bool

    var domain: ProductVariant {
        ProductVariant(id: id, label: label, quantity: quantity, unit: unit, priceMinor: priceMinor, currencyCode: currencyCode, isAvailable: isAvailable)
    }
}

private struct CategoryDTO: Decodable {
    let id: String
    let name: LocalizedText
    let imageURL: URL
    let sortOrder: Int

    var domain: Category {
        Category(id: id, name: name, imageURL: imageURL, sortOrder: sortOrder)
    }
}

private struct BannerDTO: Decodable {
    struct DestinationDTO: Decodable {
        let kind: String
        let id: String?
    }
    let id: String
    let title: LocalizedText
    let subtitle: LocalizedText
    let imageURL: URL
    let destination: DestinationDTO
    let sortOrder: Int

    var domain: Banner? {
        guard let id = destination.id, let kind = Banner.Destination.Kind(rawValue: destination.kind) else { return nil }
        return Banner(id: self.id, title: title, subtitle: subtitle, imageURL: imageURL, destination: .init(kind: kind, id: id), sortOrder: sortOrder)
    }
}

private struct BranchDTO: Decodable {
    struct OpeningIntervalDTO: Decodable {
        let weekday: Int
        let opensAt: String
        let closesAt: String
    }
    let id: String
    let name: LocalizedText
    let address: LocalizedText
    let coordinate: Branch.Coordinate
    let timeZoneIdentifier: String
    let openingHours: [OpeningIntervalDTO]
    let phoneNumber: String?
    let isDemo: Bool?

    var domain: Branch {
        Branch(id: id, name: name, address: address, coordinate: coordinate, timeZoneIdentifier: timeZoneIdentifier, openingHours: openingHours.map { .init(weekday: $0.weekday, opensAt: $0.opensAt, closesAt: $0.closesAt) }, phoneNumber: phoneNumber, isDemo: isDemo ?? false)
    }
}

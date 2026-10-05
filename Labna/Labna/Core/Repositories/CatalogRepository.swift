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

/// The catalogue query options the API supports, expressed once so the wire
/// format cannot drift from `productQuery` in `@labna/contracts`.
struct BackendProductQuery: Equatable, Sendable {
    var locale: String = "en"
    var searchText: String?
    var categoryID: String?
    var featuredOnly: Bool?
    var availableOnly: Bool?
    var sort: String?

    var queryItems: [URLQueryItem] {
        var items = [URLQueryItem(name: "locale", value: locale)]
        // Blank or whitespace-only input must not become `q=`, which the API
        // would treat as a real search term.
        if let searchText, !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            items.append(URLQueryItem(name: "q", value: searchText))
        }
        if let categoryID { items.append(URLQueryItem(name: "categoryID", value: categoryID)) }
        if let featuredOnly { items.append(URLQueryItem(name: "featured", value: String(featuredOnly))) }
        if let availableOnly { items.append(URLQueryItem(name: "available", value: String(availableOnly))) }
        if let sort { items.append(URLQueryItem(name: "sort", value: sort)) }
        return items
    }
}

struct BackendCatalogRepository: CatalogRepository {
    let baseURL: URL
    let session: URLSession
    /// Selects which language the API sorts and searches in.
    let locale: String
    private let pageLimit = 100

    init(baseURL: URL, session: URLSession = .shared, locale: String = "en") {
        self.baseURL = baseURL
        self.session = session
        self.locale = locale
    }

    func fetchProducts() async throws -> [Product] {
        try await fetchProducts(query: BackendProductQuery())
    }

    func fetchProducts(query: BackendProductQuery) async throws -> [Product] {
        var request = query
        request.locale = locale
        return try await fetchPageList(
            path: "products",
            resource: .products,
            queryItems: [URLQueryItem(name: "limit", value: String(pageLimit))] + request.queryItems,
            decode: ProductDTO.self
        ).map(\.domain)
    }

    /// Fetches one product from `GET /products/:id`, which the list route does
    /// not replace: it resolves the same branch- and locale-scoped availability
    /// for a single product and reports a missing product as 404.
    func fetchProduct(id: String) async throws -> Product {
        // The single-product route wraps the resource in `data` but omits the
        // `nextCursor` a list page carries, so it decodes as a bare envelope.
        let response: APIEnvelope<ProductDTO> = try await request(
            path: "products/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)",
            resource: .products,
            queryItems: [URLQueryItem(name: "locale", value: locale)]
        )
        return response.data.domain
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

    /// Decodes the response body into `T`. Callers pass the exact type they expect,
    /// so a list route asks for `APIPage<T>` and a single-resource route asks
    /// for the DTO itself.
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
            guard (200..<300).contains(response.statusCode) else { throw mapHTTPError(status: response.statusCode, data: data) }
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

    /// Prefers the backend's error code over the bare status so "no pickup
    /// branch" stays distinguishable from a generic 5xx. An unparseable or
    /// unknown body degrades to the status rather than inventing meaning.
    private func mapHTTPError(status: Int, data: Data) -> CatalogError {
        let code = (try? JSONDecoder().decode(APIErrorEnvelope.self, from: data).error.code) ?? nil
        return CatalogError.fromServerCode(code, status: status)
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

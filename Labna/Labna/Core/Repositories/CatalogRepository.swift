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

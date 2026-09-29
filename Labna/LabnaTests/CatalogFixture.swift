import Foundation
import Testing
@testable import Labna

/// Loads the bundled demo catalog for tests that need real product and
/// category identifiers.
enum CatalogFixture {
    static func snapshot() throws -> CatalogSnapshot {
        let productsURL = try #require(Bundle.main.url(forResource: "products", withExtension: "json"))
        let categoriesURL = try #require(Bundle.main.url(forResource: "categories", withExtension: "json"))
        let branchesURL = try #require(Bundle.main.url(forResource: "branches", withExtension: "json"))

        let products: [Product] = try JSONDecoder().decode([Product].self, from: Data(contentsOf: productsURL))
        let categories: [Labna.Category] = try JSONDecoder().decode([Labna.Category].self, from: Data(contentsOf: categoriesURL))
        let branches: [Branch] = try JSONDecoder().decode([Branch].self, from: Data(contentsOf: branchesURL))

        return CatalogSnapshot(products: products, categories: categories, banners: [], branches: branches)
    }
}

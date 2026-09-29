import Foundation
import Testing
@testable import Labna

struct DeepLinkParserTests {
    private let parser = DeepLinkParser()

    // MARK: - Valid routes

    @Test func parsesProductCategoryAndPlainRoutes() throws {
        #expect(parser.parse("labna://product/milk-full") == .product(id: "milk-full"))
        #expect(parser.parse("labna://category/milk") == .category(id: "milk"))
        #expect(parser.parse("labna://favorites") == .favorites)
        #expect(parser.parse("labna://cart") == .cart)
        #expect(parser.parse("labna://branches") == .branches)
        #expect(parser.parse("labna://recently-viewed") == .recentlyViewed)
    }

    @Test func parsingIsCaseInsensitiveForSchemeAndHost() throws {
        #expect(parser.parse("LABNA://PRODUCT/milk-full") == .product(id: "milk-full"))
        #expect(parser.parse("labna://Favorites") == .favorites)
    }

    // MARK: - Invalid input

    @Test func rejectsUnknownRoutesAndForeignSchemes() {
        #expect(parser.parse("labna://unknown") == nil)
        #expect(parser.parse("labna://products/milk-full") == nil)
        #expect(parser.parse("otherapp://product/milk-full") == nil)
        #expect(parser.parse("https://example.com/product/milk-full") == nil)
        #expect(parser.parse("mailto:someone@example.com") == nil)
    }

    @Test func rejectsMissingIdentifiers() {
        #expect(parser.parse("labna://product") == nil)
        #expect(parser.parse("labna://product/") == nil)
        #expect(parser.parse("labna://category") == nil)
        #expect(parser.parse("labna://category/   ") == nil)
    }

    @Test func rejectsMalformedURLStrings() {
        #expect(parser.parse("") == nil)
        #expect(parser.parse("not a url at all") == nil)
        #expect(parser.parse("labna://product/%") == nil)
    }

    @Test func rejectsExtraPathComponents() {
        #expect(parser.parse("labna://product/milk-full/extra") == nil)
        #expect(parser.parse("labna://favorites/extra") == nil)
        #expect(parser.parse("labna://cart/extra") == nil)
    }

    @Test func decodesPercentEncodedIdentifiers() {
        #expect(parser.parse("labna://product/milk%2Dfull") == .product(id: "milk-full"))
        #expect(parser.parse("labna://product/caf%C3%A9%20cream") == .product(id: "café cream"))
    }

    @Test func ignoresExtraQueryParametersAndFragments() {
        #expect(parser.parse("labna://product/milk-full?utm_source=widget") == .product(id: "milk-full"))
        #expect(parser.parse("labna://product/milk-full?a=1&b=2") == .product(id: "milk-full"))
        #expect(parser.parse("labna://cart?from=notification#top") == .cart)
    }

    // MARK: - URL builder

    @Test func buildsURLsForEveryRoute() throws {
        #expect(DeepLinkURLBuilder.url(for: .product(id: "milk-full"))?.absoluteString == "labna://product/milk-full")
        #expect(DeepLinkURLBuilder.url(for: .category(id: "milk"))?.absoluteString == "labna://category/milk")
        #expect(DeepLinkURLBuilder.url(for: .favorites)?.absoluteString == "labna://favorites")
        #expect(DeepLinkURLBuilder.url(for: .recentlyViewed)?.absoluteString == "labna://recently-viewed")
        #expect(DeepLinkURLBuilder.url(for: .cart)?.absoluteString == "labna://cart")
        #expect(DeepLinkURLBuilder.url(for: .branches)?.absoluteString == "labna://branches")
    }

    @Test func builderRejectsEmptyIdentifiersAndRoundTrips() throws {
        #expect(DeepLinkURLBuilder.url(for: .product(id: "  ")) == nil)
        for link: DeepLink in [.product(id: "a b"), .category(id: "milk"), .favorites, .cart, .branches, .recentlyViewed] {
            let url = try #require(DeepLinkURLBuilder.url(for: link))
            #expect(parser.parse(url) == link)
        }
    }

    // MARK: - Universal link readiness

    @Test func universalLinksMapToTheSameDeepLinkValuesWithoutTouchingNavigation() throws {
        // A future domain only needs one more route entry; no navigation change.
        let universalParser = DeepLinkParser(webRoutes: [
            DeepLinkRoute(host: "labna.example", pathPrefix: ["products"], requiresIdentifier: true) { $0.map(DeepLink.product(id:)) },
            DeepLinkRoute(host: "labna.example", pathPrefix: ["categories"], requiresIdentifier: true) { $0.map(DeepLink.category(id:)) }
        ])
        #expect(universalParser.parse("https://labna.example/products/milk-full") == .product(id: "milk-full"))
        #expect(universalParser.parse("https://labna.example/categories/milk") == .category(id: "milk"))
        #expect(universalParser.parse("https://labna.example/unknown/1") == nil)
        // The custom scheme keeps working alongside universal links.
        #expect(universalParser.parse("labna://cart") == .cart)
    }
}

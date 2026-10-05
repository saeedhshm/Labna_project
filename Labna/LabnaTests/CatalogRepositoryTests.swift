import Foundation
import Testing
@testable import Labna

private final class CatalogURLProtocol: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    private static var handler: ((URLRequest) throws -> (URLResponse, Data))?

    static func setHandler(_ value: ((URLRequest) throws -> (URLResponse, Data))?) {
        lock.lock()
        defer { lock.unlock() }
        handler = value
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lock.lock()
        let handler = Self.handler
        Self.lock.unlock()
        do {
            guard let handler else { throw URLError(.unknown) }
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

@MainActor
@Suite(.serialized)
struct CatalogRepositoryTests {
    private func session() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [CatalogURLProtocol.self]
        return URLSession(configuration: config)
    }

    private func remote(_ session: URLSession) -> JSONCatalogRepository {
        JSONCatalogRepository(source: RemoteCatalogDataSource(
            baseURL: URL(string: "https://labna.test/v1/catalog/")!, session: session
        ))
    }

    private var baseURL: URL { URL(string: "http://127.0.0.1:3001/api/v1")! }

    private func backend(_ session: URLSession, baseURL: URL = URL(string: "http://127.0.0.1:3001/api/v1")!) -> BackendCatalogRepository {
        BackendCatalogRepository(baseURL: baseURL, session: session)
    }

    @Test func localAndRemoteDecodeIdenticalCatalogs() async throws {
        let local = JSONCatalogRepository(source: LocalJSONDataSource())
        // Prepare fixtures on the main actor; URLProtocol callbacks may run elsewhere.
        var fixtures: [String: Data] = [:]
        for resource in CatalogResource.allCases {
            fixtures[resource.rawValue] = try await LocalJSONDataSource().data(for: resource)
        }
        let responses = fixtures
        CatalogURLProtocol.setHandler { request in
            #expect(request.httpMethod == "GET")
            #expect(request.value(forHTTPHeaderField: "Accept") == "application/json")
            let url = try #require(request.url)
            #expect(url.path.hasPrefix("/v1/catalog/"))
            let data = try #require(responses[url.lastPathComponent])
            return (HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)!, data)
        }
        let session = session()
        defer { session.invalidateAndCancel(); CatalogURLProtocol.setHandler(nil) }
        let remote = remote(session)
        let products = try await remote.fetchProducts()
        let categories = try await remote.fetchCategories()
        let banners = try await remote.fetchBanners()
        let branches = try await remote.fetchBranches()
        #expect(products == (try await local.fetchProducts()))
        #expect(categories == (try await local.fetchCategories()))
        #expect(banners == (try await local.fetchBanners()))
        #expect(branches == (try await local.fetchBranches()))
    }

    @Test func backendRepositoryDecodesEnvelopePagesAndMapsDTOs() async throws {
        var requestedURLs: [URL] = []
        CatalogURLProtocol.setHandler { request in
            let url = try #require(request.url)
            requestedURLs.append(url)
            #expect(request.httpMethod == "GET")
            #expect(request.value(forHTTPHeaderField: "Accept") == "application/json")
            let path = url.path
            let body: String
            if path.hasSuffix("/products") && url.query?.contains("cursor=next-products") == true {
                body = #"{"data":[{"id":"yogurt","categoryID":"dairy","name":{"ar":"زبادي","en":"Yogurt"},"description":{"ar":"طازج","en":"Fresh"},"imageURLs":["https://images.unsplash.com/yogurt.png"],"ingredients":{"ar":"لبن","en":"Milk"},"storageInstructions":{"ar":"بارد","en":"Keep chilled"},"isFeatured":false,"isDemo":false,"variants":[{"id":"yogurt-1","label":{"ar":"كوب","en":"Cup"},"quantity":200,"unit":"g","priceMinor":2500,"currencyCode":"EGP","isAvailable":false}]}],"meta":{"requestID":"r2","nextCursor":null}}"#
            } else if path.hasSuffix("/products") {
                body = #"{"data":[{"id":"milk-full","categoryID":"dairy","name":{"ar":"حليب","en":"Milk"},"description":{"ar":"كامل الدسم","en":"Full cream"},"imageURLs":["https://images.unsplash.com/milk.png"],"ingredients":{"ar":"لبن","en":"Milk"},"storageInstructions":{"ar":"بارد","en":"Keep chilled"},"isFeatured":true,"isDemo":false,"variants":[{"id":"milk-full-1l","label":{"ar":"١ لتر","en":"1 L"},"quantity":1000,"unit":"ml","priceMinor":5000,"currencyCode":"EGP","isAvailable":true}]}],"meta":{"requestID":"r1","nextCursor":"next-products"}}"#
            } else if path.hasSuffix("/categories") {
                body = #"{"data":[{"id":"dairy","name":{"ar":"ألبان","en":"Dairy"},"imageURL":"https://images.unsplash.com/category.png","sortOrder":1}],"meta":{"requestID":"r3","nextCursor":null}}"#
            } else if path.hasSuffix("/banners") {
                body = #"{"data":[{"id":"hero","title":{"ar":"عرض","en":"Offer"},"subtitle":{"ar":"طازج","en":"Fresh"},"imageURL":"https://images.unsplash.com/banner.png","destination":{"kind":"product","id":"milk-full"},"sortOrder":1},{"id":"external","title":{"ar":"خارجي","en":"External"},"subtitle":{"ar":"رابط","en":"Link"},"imageURL":"https://images.unsplash.com/external.png","destination":{"kind":"external","url":"https://example.com"},"sortOrder":2}],"meta":{"requestID":"r4","nextCursor":null}}"#
            } else if path.hasSuffix("/branches") {
                body = #"{"data":[{"id":"main","name":{"ar":"الرئيسي","en":"Main"},"address":{"ar":"القاهرة","en":"Cairo"},"coordinate":{"latitude":30.0,"longitude":31.0},"timeZoneIdentifier":"Africa/Cairo","openingHours":[{"weekday":1,"opensAt":"09:00","closesAt":"17:00"}],"phoneNumber":"+201012345678","isDemo":false}],"meta":{"requestID":"r5","nextCursor":null}}"#
            } else {
                body = #"{"data":[],"meta":{"requestID":"missing","nextCursor":null}}"#
            }
            return (HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data(body.utf8))
        }
        let session = session()
        defer { session.invalidateAndCancel(); CatalogURLProtocol.setHandler(nil) }
        let repository = backend(session)

        let products = try await repository.fetchProducts()
        let categories = try await repository.fetchCategories()
        let banners = try await repository.fetchBanners()
        let branches = try await repository.fetchBranches()

        #expect(products.map(\.id) == ["milk-full", "yogurt"])
        #expect(products[0].variants[0].isAvailable)
        #expect(categories.first?.name.en == "Dairy")
        #expect(banners.map(\.id) == ["hero"])
        #expect(branches.first?.openingHours.first?.weekday == 1)
        #expect(requestedURLs.contains { $0.query?.contains("cursor=next-products") == true })
        #expect(requestedURLs.contains { $0.query?.contains("locale=en") == true })
    }

    @Test func backendRepositoryReportsHTTPAndDecodingErrors() async throws {
        CatalogURLProtocol.setHandler { request in
            (HTTPURLResponse(url: request.url!, statusCode: 500, httpVersion: nil, headerFields: nil)!, Data("{}".utf8))
        }
        let session = session()
        defer { session.invalidateAndCancel(); CatalogURLProtocol.setHandler(nil) }
        do {
            _ = try await backend(session).fetchCategories()
            Issue.record("Expected HTTP failure")
        } catch CatalogError.httpStatus(let status) {
            #expect(status == 500)
        }

        CatalogURLProtocol.setHandler { request in
            (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data("{broken".utf8))
        }
        do {
            _ = try await backend(session).fetchCategories()
            Issue.record("Expected decoding failure")
        } catch CatalogError.invalidData(let resource) {
            #expect(resource == .categories)
        }
    }

    @Test func baseURLComesFromASingleConfigurablePlace() async throws {
        // Every network client resolves its origin from AppConfiguration, so a
        // localhost URL never needs to be repeated elsewhere.
        let configured = AppConfiguration.backendAPIBaseURL
        #expect(configured.path.hasSuffix("/api/v1"))
        #expect(configured.isAllowedCatalogAPIBaseURL)
        // The backend is the primary source; bundled JSON is only bootstrap.
        if case .localJSON = AppConfiguration.backend.dataSource {
            Issue.record("Expected the backend to be the primary data source")
        }
        #expect(AppConfiguration.productionAPIBaseURL.scheme == "https")
        // The value the app actually ships resolves to the same place.
        #expect(AppContainer().catalogRepository is BackendCatalogRepository)
    }

    @Test func productQueryForwardsEverySupportedFilterToTheAPI() async throws {
        var requested: URL?
        CatalogURLProtocol.setHandler { request in
            let url = try #require(request.url)
            requested = url
            return (HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data(#"{"data":[],"meta":{"requestID":"r","nextCursor":null}}"#.utf8))
        }
        let session = session()
        defer { session.invalidateAndCancel(); CatalogURLProtocol.setHandler(nil) }
        let repository = BackendCatalogRepository(baseURL: baseURL, session: session, locale: "ar")

        _ = try await repository.fetchProducts(query: BackendProductQuery(
            locale: "ar",
            searchText: "milk",
            categoryID: "dairy",
            featuredOnly: true,
            availableOnly: false,
            sort: "priceAsc"
        ))

        let url = try #require(requested)
        let items = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems)
        let values = Dictionary(uniqueKeysWithValues: items.map { ($0.name, $0.value) })
        #expect(values["locale"] == "ar")
        #expect(values["q"] == "milk")
        #expect(values["categoryID"] == "dairy")
        #expect(values["featured"] == "true")
        #expect(values["available"] == "false")
        #expect(values["sort"] == "priceAsc")
    }

    @Test func emptySearchIsOmittedSoTheAPIIsNotAskedForEverything() async throws {
        let query = BackendProductQuery(locale: "en", searchText: "   ")
        #expect(query.queryItems.map(\.name) == ["locale"])
        #expect(BackendProductQuery(locale: "en").queryItems.map(\.name) == ["locale"])
    }

    /// The single-product endpoint answers with a bare object, so it is decoded
    /// directly rather than through the `{ data }` list envelope.
    private func productDetailBody(locale: String = "ar") -> String {
        """
        {"data":{"id":"milk-full","categoryID":"dairy",
         "name":{"ar":"حليب","en":"Milk"},
         "description":{"ar":"كامل","en":"Full"},
         "imageURLs":["https://images.unsplash.com/milk.png"],
         "ingredients":{"ar":"لبن","en":"Milk"},
         "storageInstructions":{"ar":"بارد","en":"Chilled"},
         "isFeatured":true,"isDemo":false,
         "variants":[{"id":"milk-full-1l","label":{"ar":"١ لتر","en":"1 L"},
                      "quantity":1000,"unit":"ml","priceMinor":5000,
                      "currencyCode":"EGP","isAvailable":true}],
         "meta":{"requestID":"r","branchID":"demo-cairo"}}}
        """
    }

    @Test func productDetailUsesTheSingleProductEndpointAndMapsToDomain() async throws {
        var requested: URL?
        CatalogURLProtocol.setHandler { request in
            let url = try #require(request.url)
            requested = url
            return (HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data(productDetailBody().utf8))
        }
        let session = session()
        defer { session.invalidateAndCancel(); CatalogURLProtocol.setHandler(nil) }
        let repository = BackendCatalogRepository(baseURL: baseURL, session: session, locale: "ar")

        let product = try await repository.fetchProduct(id: "milk-full")

        let url = try #require(requested)
        #expect(url.path == "/api/v1/products/milk-full")
        #expect(url.query?.contains("locale=ar") == true)
        #expect(product.id == "milk-full")
        #expect(product.variants.first?.priceMinor == 5000)
        #expect(product.variants.first?.isAvailable == true)
    }

    @Test func productDetailEscapesIdentifiersAndReportsServerErrors() async throws {
        var requested: URL?
        CatalogURLProtocol.setHandler { request in
            let url = try #require(request.url)
            requested = url
            return (HTTPURLResponse(url: url, statusCode: 404, httpVersion: nil, headerFields: nil)!, Data(#"{"error":{"code":"NOT_FOUND","message":"Product not found"},"meta":{"requestID":"r"}}"#.utf8))
        }
        let session = session()
        defer { session.invalidateAndCancel(); CatalogURLProtocol.setHandler(nil) }
        let repository = BackendCatalogRepository(baseURL: baseURL, session: session)

        do {
            _ = try await repository.fetchProduct(id: "milk/full")
            Issue.record("Expected a not-found failure")
        } catch CatalogError.httpStatus(let status) {
            #expect(status == 404)
        }
        #expect(requested?.path == "/api/v1/products/milk/full")
    }

    @Test func serverErrorCodesAreMappedInsteadOfCollapsingToAStatus() async throws {
        for (code, expected): (String, CatalogError) in [
            ("NO_PICKUP_BRANCH", .noPickupBranch),
            ("INVALID_BRANCH", .invalidBranch),
        ] {
            CatalogURLProtocol.setHandler { request in
                let url = try #require(request.url)
                let body = "{\"error\":{\"code\":\"\(code)\",\"message\":\"nope\"},\"meta\":{\"requestID\":\"r\"}}"
                return (HTTPURLResponse(url: url, statusCode: 503, httpVersion: nil, headerFields: nil)!, Data(body.utf8))
            }
            let session = session()
            defer { session.invalidateAndCancel(); CatalogURLProtocol.setHandler(nil) }
            do {
                _ = try await BackendCatalogRepository(baseURL: baseURL, session: session).fetchProducts()
                Issue.record("Expected \(code) to fail")
            } catch let error as CatalogError {
                #expect(error == expected)
            }
        }

        // An unknown or unreadable code must not invent a specific meaning.
        #expect(CatalogError.fromServerCode(nil, status: 500) == .httpStatus(500))
        #expect(CatalogError.fromServerCode("SOMETHING_NEW", status: 500) == .httpStatus(500))
    }

    @Test func backendConfigurationUsesLocalSimulatorURLAndRejectsNonLocalHTTP() async throws {
        #expect(AppConfiguration.backendAPIBaseURL.path.hasSuffix("/api/v1") || AppConfiguration.backendAPIBaseURL.scheme == "https")
        do {
            _ = try await backend(session(), baseURL: URL(string: "http://example.com/api/v1")!).fetchProducts()
            Issue.record("Expected invalid non-local HTTP base URL")
        } catch CatalogError.invalidBaseURL {}
    }

    @Test func httpFailureDoesNotFallBackToMock() async throws {
        CatalogURLProtocol.setHandler { request in
            (HTTPURLResponse(url: request.url!, statusCode: 503, httpVersion: nil, headerFields: nil)!, Data("[]".utf8))
        }
        let session = session()
        defer { session.invalidateAndCancel(); CatalogURLProtocol.setHandler(nil) }
        do {
            _ = try await remote(session).fetchProducts()
            Issue.record("Expected server error")
        } catch CatalogError.httpStatus(let status) {
            #expect(status == 503)
        }
    }

    @Test func malformedJSONIsReported() async throws {
        CatalogURLProtocol.setHandler { request in
            (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data("{broken".utf8))
        }
        let session = session()
        defer { session.invalidateAndCancel(); CatalogURLProtocol.setHandler(nil) }
        do {
            _ = try await remote(session).fetchProducts()
            Issue.record("Expected decoding error")
        } catch CatalogError.invalidData(let resource) {
            #expect(resource == .products)
        }
    }

    @Test func networkErrorsAndCancellationAreDistinct() async throws {
        let session = session()
        defer { session.invalidateAndCancel(); CatalogURLProtocol.setHandler(nil) }
        for code in [URLError.Code.notConnectedToInternet, .timedOut, .cancelled] {
            CatalogURLProtocol.setHandler { _ in throw URLError(code) }
            do {
                _ = try await remote(session).fetchProducts()
                Issue.record("Expected failure")
            } catch is CancellationError {
                #expect(code == .cancelled)
            } catch CatalogError.network(let actual) {
                #expect(actual == code)
                #expect(code != .cancelled)
            }
        }
    }

    @Test func invalidConfigurationAndMissingResourceAreReported() async throws {
        do {
            _ = try await RemoteCatalogDataSource(baseURL: URL(string: "file:///tmp/catalog")!).data(for: .products)
            Issue.record("Expected invalid URL")
        } catch CatalogError.invalidBaseURL {}
        do {
            _ = try await LocalJSONDataSource(bundle: Bundle(for: CatalogURLProtocol.self)).data(for: .products)
            Issue.record("Expected missing resource in test bundle")
        } catch CatalogError.missingResource(let resource) {
            #expect(resource == .products)
        }
    }

    @Test func storeCanRetryAfterFailure() async throws {
        let session = session()
        defer { session.invalidateAndCancel(); CatalogURLProtocol.setHandler(nil) }
        CatalogURLProtocol.setHandler { _ in throw URLError(.notConnectedToInternet) }
        let container = AppContainer.preview(language: .english, repository: remote(session))
        await container.catalog.loadIfNeeded()
        guard case .available(let cachedSnapshot, _, _) = container.catalog.state else {
            Issue.record("Expected bundled catalog while offline"); return
        }
        #expect(cachedSnapshot.products.count == 15)
        CatalogURLProtocol.setHandler { request in
            (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data("[]".utf8))
        }
        await container.catalog.reload()
        guard case .available(let snapshot, _, let refreshError) = container.catalog.state else {
            Issue.record("Expected usable catalog after retry"); return
        }
        #expect(snapshot.products.count == 15)
        #expect(refreshError != nil)
        // Invalid remote refresh keeps the bundled cache instead of publishing partial/invalid data.
        CatalogURLProtocol.setHandler { _ in throw URLError(.badServerResponse) }
        await container.catalog.loadIfNeeded()
        guard case .available = container.catalog.state else { Issue.record("Loaded data should be reused"); return }
    }

    @Test func storeCancellationRestoresIdle() async {
        let session = session()
        defer { session.invalidateAndCancel(); CatalogURLProtocol.setHandler(nil) }
        CatalogURLProtocol.setHandler { _ in throw URLError(.cancelled) }
        let container = AppContainer.preview(language: .english, repository: remote(session))
        await container.catalog.loadIfNeeded()
        guard case .available = container.catalog.state else { Issue.record("Bundled bootstrap should remain usable"); return }
    }

    @Test func defaultContainerLoadsBundledData() async {
        let container = AppContainer.preview(language: .arabic)
        await container.catalog.loadIfNeeded()
        guard case .available(let snapshot, _, _) = container.catalog.state else {
            Issue.record("Expected local catalog"); return
        }
        #expect(snapshot.products.count == 15)
        #expect(snapshot.categories.count == 5)
    }
}

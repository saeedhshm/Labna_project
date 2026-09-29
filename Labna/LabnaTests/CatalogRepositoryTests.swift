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

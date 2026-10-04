import Foundation
import Testing
@testable import Labna

private final class AuthURLProtocol: URLProtocol, @unchecked Sendable {
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

private final class MemoryAuthSessionStore: AuthSessionStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var stored: AuthSession?

    init(_ stored: AuthSession? = nil) {
        self.stored = stored
    }

    func load() throws -> AuthSession? {
        lock.lock()
        defer { lock.unlock() }
        return stored
    }

    func save(_ session: AuthSession) throws {
        lock.lock()
        defer { lock.unlock() }
        stored = session
    }

    func clear() throws {
        lock.lock()
        defer { lock.unlock() }
        stored = nil
    }
}

@MainActor
@Suite(.serialized)
struct AuthServiceTests {
    private func session() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [AuthURLProtocol.self]
        return URLSession(configuration: config)
    }

    private func service(storage: MemoryAuthSessionStore = MemoryAuthSessionStore()) -> AuthService {
        AuthService(baseURL: URL(string: "http://127.0.0.1:3001/api/v1")!, session: session(), storage: storage)
    }

    @Test func loginStoresSessionAndLoadsMe() async throws {
        AuthURLProtocol.setHandler { request in
            let url = try #require(request.url)
            #expect(request.value(forHTTPHeaderField: "Accept") == "application/json")
            if url.path.hasSuffix("/customer/auth/login") {
                #expect(request.httpMethod == "POST")
                return authResponse(url: url, token: "access-login", refresh: "refresh-login")
            }
            if url.path.hasSuffix("/customer/me") {
                #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer access-login")
                return customerResponse(url: url)
            }
            return notFound(url: url)
        }
        defer { AuthURLProtocol.setHandler(nil) }
        let service = service()
        let customer = try await service.login(email: "customer@example.com", password: "password123")
        #expect(customer.email == "customer@example.com")
        let me = try await service.me()
        #expect(me == customer)
    }

    @Test func registerMapsDuplicateAndValidationFailures() async throws {
        AuthURLProtocol.setHandler { request in
            let url = try #require(request.url)
            if url.path.hasSuffix("/customer/auth/register") {
                return errorResponse(url: url, status: 409, code: "DUPLICATE_RESOURCE", message: "Identifier or SKU already exists")
            }
            return notFound(url: url)
        }
        defer { AuthURLProtocol.setHandler(nil) }
        do {
            _ = try await service().register(name: "Demo", phoneNumber: "+201012345678", email: "customer@example.com", password: "password123")
            Issue.record("Expected duplicate account")
        } catch AuthError.duplicateAccount {}

        AuthURLProtocol.setHandler { request in
            let url = try #require(request.url)
            return errorResponse(url: url, status: 422, code: "VALIDATION_ERROR", message: "Invalid input")
        }
        do {
            _ = try await service().register(name: "D", phoneNumber: "010", email: "broken", password: "short")
            Issue.record("Expected validation error")
        } catch AuthError.validation {}
    }

    @Test func invalidCredentialsAndBackendUnavailableAreReported() async throws {
        AuthURLProtocol.setHandler { request in
            let url = try #require(request.url)
            return errorResponse(url: url, status: 401, code: "INVALID_CREDENTIALS", message: "Invalid credentials")
        }
        defer { AuthURLProtocol.setHandler(nil) }
        do {
            _ = try await service().login(email: "customer@example.com", password: "bad")
            Issue.record("Expected invalid credentials")
        } catch AuthError.invalidCredentials {}

        AuthURLProtocol.setHandler { _ in throw URLError(.notConnectedToInternet) }
        do {
            _ = try await service().login(email: "customer@example.com", password: "password123")
            Issue.record("Expected network error")
        } catch AuthError.network(let code) {
            #expect(code == .notConnectedToInternet)
        }
    }

    @Test func restoreRefreshesExpiredAccessTokenAndPersistsRotatedRefreshCookie() async throws {
        let storage = MemoryAuthSessionStore(expiredSession(refresh: "refresh-old"))
        AuthURLProtocol.setHandler { request in
            let url = try #require(request.url)
            if url.path.hasSuffix("/customer/auth/refresh") {
                #expect(request.value(forHTTPHeaderField: "Cookie") == "labna_customer_refresh=refresh-old")
                return authResponse(url: url, token: "access-new", refresh: "refresh-new")
            }
            if url.path.hasSuffix("/customer/me") {
                #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer access-new")
                return customerResponse(url: url)
            }
            return notFound(url: url)
        }
        defer { AuthURLProtocol.setHandler(nil) }
        let restored = try await service(storage: storage).restore()
        #expect(restored?.email == "customer@example.com")
        #expect(try storage.load()?.refreshCookie == "refresh-new")
    }

    @Test func expiredRefreshClearsSessionAndStoreBecomesGuest() async throws {
        let storage = MemoryAuthSessionStore(expiredSession(refresh: "expired"))
        AuthURLProtocol.setHandler { request in
            let url = try #require(request.url)
            return errorResponse(url: url, status: 401, code: "UNAUTHORIZED", message: "Expired or reused refresh token")
        }
        defer { AuthURLProtocol.setHandler(nil) }
        let store = AuthStore(service: service(storage: storage))
        await store.restore()
        #expect(store.state == .guest)
        #expect(store.lastError == .expiredSession)
        #expect(try storage.load() == nil)
    }

    @Test func restoreKeepsStoredCustomerWhenBackendIsUnavailable() async throws {
        let storage = MemoryAuthSessionStore(activeSession(access: "access-active", refresh: "refresh-active"))
        AuthURLProtocol.setHandler { _ in throw URLError(.cannotConnectToHost) }
        defer { AuthURLProtocol.setHandler(nil) }
        let store = AuthStore(service: service(storage: storage))
        await store.restore()
        #expect(store.customer?.email == "customer@example.com")
        #expect(try storage.load() != nil)
    }

    @Test func simultaneousRefreshRequestsShareOneBackendRefresh() async throws {
        let storage = MemoryAuthSessionStore(expiredSession(refresh: "refresh-once"))
        let lock = NSLock()
        var refreshCount = 0
        AuthURLProtocol.setHandler { request in
            let url = try #require(request.url)
            if url.path.hasSuffix("/customer/auth/refresh") {
                lock.lock()
                refreshCount += 1
                lock.unlock()
                Thread.sleep(forTimeInterval: 0.05)
                return authResponse(url: url, token: "access-coalesced", refresh: "refresh-rotated")
            }
            if url.path.hasSuffix("/customer/me") { return customerResponse(url: url) }
            return notFound(url: url)
        }
        defer { AuthURLProtocol.setHandler(nil) }
        let service = service(storage: storage)
        async let first = service.restore()
        async let second = service.restore()
        _ = try await (first, second)
        #expect(refreshCount == 1)
    }

    @Test func logoutRevokesBackendSessionAndClearsLocalSession() async throws {
        let storage = MemoryAuthSessionStore(activeSession(access: "access-active", refresh: "refresh-active"))
        AuthURLProtocol.setHandler { request in
            let url = try #require(request.url)
            if url.path.hasSuffix("/customer/me") { return customerResponse(url: url) }
            if url.path.hasSuffix("/customer/auth/logout") {
                #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer access-active")
                return json(url: url, body: #"{"data":{"loggedOut":true},"meta":{"requestID":"r"}}"#)
            }
            return notFound(url: url)
        }
        defer { AuthURLProtocol.setHandler(nil) }
        let store = AuthStore(service: service(storage: storage))
        await store.restore()
        #expect(store.isAuthenticated)
        await store.logout()
        #expect(store.state == .guest)
        #expect(try storage.load() == nil)
    }

    private func activeSession(access: String, refresh: String) -> AuthSession {
        AuthSession(accessToken: access, accessTokenExpiresAt: Date().addingTimeInterval(600), refreshCookie: refresh, customer: customer())
    }

    private func expiredSession(refresh: String) -> AuthSession {
        AuthSession(accessToken: "expired", accessTokenExpiresAt: Date().addingTimeInterval(-60), refreshCookie: refresh, customer: customer())
    }

    private func customer() -> Customer {
        Customer(id: "customer-1", name: "Demo Customer", phoneNumber: "+201012345678", email: "customer@example.com", addresses: [], createdAt: "2026-01-01T00:00:00.000Z")
    }
}

private func authResponse(url: URL, token: String, refresh: String) -> (URLResponse, Data) {
    json(
        url: url,
        status: 200,
        headers: ["Set-Cookie": "labna_customer_refresh=\(refresh); Path=/api/v1/customer/auth; HttpOnly; SameSite=Strict"],
        body: #"{"data":{"accessToken":"TOKEN","expiresIn":900,"customer":{"id":"customer-1","name":"Demo Customer","phoneNumber":"+201012345678","email":"customer@example.com","addresses":[],"createdAt":"2026-01-01T00:00:00.000Z"}},"meta":{"requestID":"r"}}"#.replacingOccurrences(of: "TOKEN", with: token)
    )
}

private func customerResponse(url: URL) -> (URLResponse, Data) {
    json(url: url, body: #"{"data":{"id":"customer-1","name":"Demo Customer","phoneNumber":"+201012345678","email":"customer@example.com","addresses":[],"createdAt":"2026-01-01T00:00:00.000Z"},"meta":{"requestID":"r"}}"#)
}

private func errorResponse(url: URL, status: Int, code: String, message: String) -> (URLResponse, Data) {
    json(url: url, status: status, body: "{\"error\":{\"code\":\"\(code)\",\"message\":\"\(message)\"},\"meta\":{\"requestID\":\"r\"}}")
}

private func notFound(url: URL) -> (URLResponse, Data) {
    errorResponse(url: url, status: 404, code: "NOT_FOUND", message: "Not found")
}

private func json(url: URL, status: Int = 200, headers: [String: String]? = nil, body: String) -> (URLResponse, Data) {
    (HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: headers)!, Data(body.utf8))
}

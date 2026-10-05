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
    private func session(cookieStorage: HTTPCookieStorage? = nil) -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [AuthURLProtocol.self]
        if let cookieStorage {
            config.httpCookieStorage = cookieStorage
            config.httpCookieAcceptPolicy = .always
            config.httpShouldSetCookies = true
        }
        return URLSession(configuration: config)
    }

    private func service(storage: MemoryAuthSessionStore = MemoryAuthSessionStore(), cookieStorage: HTTPCookieStorage? = nil) -> AuthService {
        AuthService(baseURL: URL(string: "http://127.0.0.1:3001/api/v1")!, session: session(cookieStorage: cookieStorage), storage: storage, cookieStorage: cookieStorage)
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

    /// The API rejects a cookie-carrying `/customer/auth/*` request without an
    /// allow-listed `Origin` (403 `INVALID_ORIGIN`), which `URLSession` never
    /// adds on its own. Refresh and logout are therefore dead without it.
    @Test func cookieAuthenticatedRequestsCarryAnOriginHeader() async throws {
        var refreshHeaders: [String: String] = [:]
        var logoutHeaders: [String: String] = [:]
        AuthURLProtocol.setHandler { request in
            let url = try #require(request.url)
            let path = url.path
            if path.hasSuffix("/customer/auth/refresh") {
                refreshHeaders = request.allHTTPHeaderFields ?? [:]
                return json(url: url, body: #"{"data":{"accessToken":"access-rotated","expiresIn":900,"customer":{"id":"customer-1","name":"Demo Customer","phoneNumber":"+201012345678","email":"customer@example.com","addresses":[],"createdAt":"2026-01-01T00:00:00.000Z"}},"meta":{"requestID":"r"}}"#)
            }
            if path.hasSuffix("/customer/auth/logout") {
                logoutHeaders = request.allHTTPHeaderFields ?? [:]
                return json(url: url, body: #"{"data":{"loggedOut":true},"meta":{"requestID":"r"}}"#)
            }
            return notFound(url: url)
        }
        defer { AuthURLProtocol.setHandler(nil) }

        let storage = MemoryAuthSessionStore(expiredSession(refresh: "refresh-old"))
        let service = service(storage: storage)

        _ = try await service.refreshForTesting()
        #expect(refreshHeaders["Origin"] == AppConfiguration.customerAuthOrigin)
        #expect(refreshHeaders["Cookie"] == "labna_customer_refresh=refresh-old")

        // Logout must run against the session refresh just produced, not the
        // stale bootstrap token.
        _ = try await service.logoutForTesting()
        #expect(logoutHeaders["Origin"] == AppConfiguration.customerAuthOrigin)
        #expect(logoutHeaders["Cookie"] == "labna_customer_refresh=refresh-old")
        #expect(logoutHeaders["Authorization"] == "Bearer access-rotated")
    }

    @Test func theAuthSessionNeverReliesOnTheSharedCookieJar() {
        // The refresh token lives in the Keychain and is replayed by hand, so a
        // cookie the jar auto-attaches could not satisfy the Origin guard and
        // would be sent twice for refresh.
        let configuration = URLSessionConfiguration.default
        #expect(AuthService.defaultSession().configuration.httpShouldSetCookies == false)
        #expect(AuthService.defaultSession().configuration.httpCookieStorage == nil)
        _ = configuration
    }

    @Test func aNetworkFailureDuringRefreshKeepsTheStoredSession() async throws {
        let storage = MemoryAuthSessionStore(expiredSession(refresh: "refresh-good"))
        AuthURLProtocol.setHandler { _ in throw URLError(.notConnectedToInternet) }
        defer { AuthURLProtocol.setHandler(nil) }
        let store = AuthStore(service: service(storage: storage))

        // Being offline says nothing about the 30-day refresh session, so the
        // user must stay signed in rather than being silently logged out.
        await store.restore()
        #expect(store.isAuthenticated)
        #expect(try storage.load() != nil)
        #expect(try storage.load()?.refreshCookie == "refresh-good")
    }

    @Test func logoutClearsLocalStateEvenWhenTheServerCannotBeReached() async throws {
        let storage = MemoryAuthSessionStore(activeSession(access: "access-active", refresh: "refresh-active"))
        AuthURLProtocol.setHandler { request in
            let url = try #require(request.url)
            if url.path.hasSuffix("/customer/me") { return customerResponse(url: url) }
            throw URLError(.notConnectedToInternet)
        }
        defer { AuthURLProtocol.setHandler(nil) }
        let store = AuthStore(service: service(storage: storage))
        await store.restore()
        #expect(store.isAuthenticated)

        await store.logout()
        // A user who asked to sign out must never be stranded signed in.
        #expect(store.state == .guest)
        #expect(try storage.load() == nil)
    }

    @Test func onlyDefinitiveRejectionsEndTheSession() {
        // A 30-day refresh token must survive anything the API did not refuse.
        #expect(AuthError.unauthorized.terminatesSession)
        #expect(AuthError.expiredSession.terminatesSession)
        #expect(AuthError.invalidCredentials.terminatesSession)
        #expect(!(AuthError.network(.notConnectedToInternet).terminatesSession))
        #expect(!(AuthError.network(.timedOut).terminatesSession))
        #expect(!(AuthError.httpStatus(403, nil).terminatesSession))
        #expect(!(AuthError.httpStatus(500, nil).terminatesSession))
        #expect(!(AuthError.invalidResponse.terminatesSession))
        #expect(!(AuthError.validation("x").terminatesSession))
    }

    @Test func aRefreshCookieFromAnotherHostIsNeverAccepted() async throws {
        let cookieStorage = HTTPCookieStorage()
        // Same cookie name, unrelated host: accepting it would hand this app a
        // token that belongs somewhere else entirely.
        let foreign = try #require(HTTPCookie(properties: [
            .domain: "example.invalid",
            .path: "/api/v1/customer/auth",
            .name: "labna_customer_refresh",
            .value: "not-ours",
            .secure: "FALSE",
        ]))
        cookieStorage.setCookie(foreign)
        defer { cookieStorage.deleteCookie(foreign) }

        AuthURLProtocol.setHandler { request in
            let url = try #require(request.url)
            if url.path.hasSuffix("/customer/auth/login") {
                // No cookie for our host and none in the response, so login
                // must fail loudly rather than persist someone else's token.
                return json(url: url, body: #"{"data":{"accessToken":"access","expiresIn":900,"customer":{"id":"customer-1","name":"Demo Customer","phoneNumber":"+201012345678","email":"customer@example.com","addresses":[],"createdAt":"2026-01-01T00:00:00.000Z"}},"meta":{"requestID":"r"}}"#)
            }
            return notFound(url: url)
        }
        defer { AuthURLProtocol.setHandler(nil) }

        do {
            _ = try await service(cookieStorage: cookieStorage).login(email: "customer@example.com", password: "password123")
            Issue.record("Expected login to fail without our own refresh cookie")
        } catch AuthError.invalidResponse {}
    }

    @Test func loginUsesStoredRefreshCookieWhenHeaderIsUnavailable() async throws {
        let cookieStorage = HTTPCookieStorage.shared
        cookieStorage.cookies?.filter { $0.name == "labna_customer_refresh" }.forEach(cookieStorage.deleteCookie)
        let cookie = try #require(HTTPCookie(properties: [
            .domain: "127.0.0.1",
            .path: "/api/v1/customer/auth",
            .name: "labna_customer_refresh",
            .value: "refresh-from-storage",
            .secure: "FALSE",
        ]))
        cookieStorage.setCookie(cookie)
        defer { cookieStorage.deleteCookie(cookie) }
        AuthURLProtocol.setHandler { request in
            let url = try #require(request.url)
            if url.path.hasSuffix("/customer/auth/login") {
                #expect(cookieStorage.cookies?.contains(where: { $0.name == "labna_customer_refresh" }) == true)
                return json(url: url, body: #"{"data":{"accessToken":"access-login","expiresIn":900,"customer":{"id":"customer-1","name":"Demo Customer","phoneNumber":"+201012345678","email":"customer@example.com","addresses":[],"createdAt":"2026-01-01T00:00:00.000Z"}},"meta":{"requestID":"r"}}"#)
            }
            return notFound(url: url)
        }
        defer { AuthURLProtocol.setHandler(nil) }

        let storage = MemoryAuthSessionStore()
        _ = try await service(storage: storage, cookieStorage: cookieStorage).login(email: "customer@example.com", password: "password123")
        #expect(try storage.load()?.refreshCookie == "refresh-from-storage")
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

    @Test func updateProfilePatchesBackendAndPersistsReturnedCustomer() async throws {
        let storage = MemoryAuthSessionStore(activeSession(access: "access-active", refresh: "refresh-active"))
        AuthURLProtocol.setHandler { request in
            let url = try #require(request.url)
            if url.path.hasSuffix("/customer/me") && request.httpMethod == "GET" {
                return customerResponse(url: url)
            }
            if url.path.hasSuffix("/customer/me") && request.httpMethod == "PATCH" {
                #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer access-active")
                #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
                let body = try #require(bodyData(from: request))
                let jsonObject = try #require(JSONSerialization.jsonObject(with: body) as? [String: String])
                #expect(jsonObject["name"] == "Updated Customer")
                #expect(jsonObject["phoneNumber"] == "+201099999999")
                #expect(jsonObject["email"] == "updated@example.com")
                return customerResponse(url: url, name: "Updated Customer", phoneNumber: "+201099999999", email: "updated@example.com")
            }
            return notFound(url: url)
        }
        defer { AuthURLProtocol.setHandler(nil) }
        let store = AuthStore(service: service(storage: storage))
        await store.restore()
        let success = await store.updateProfile(name: " Updated Customer ", phoneNumber: " +201099999999 ", email: " updated@example.com ")
        #expect(success)
        #expect(store.customer?.email == "updated@example.com")
        #expect(try storage.load()?.customer.name == "Updated Customer")
    }

    @Test func changePasswordMapsServerValidationErrors() async throws {
        let storage = MemoryAuthSessionStore(activeSession(access: "access-active", refresh: "refresh-active"))
        AuthURLProtocol.setHandler { request in
            let url = try #require(request.url)
            if url.path.hasSuffix("/customer/me") && request.httpMethod == "GET" {
                return customerResponse(url: url)
            }
            if url.path.hasSuffix("/customer/me/password") {
                return errorResponse(url: url, status: 401, code: "INVALID_CURRENT_PASSWORD", message: "Current password is incorrect")
            }
            return notFound(url: url)
        }
        defer { AuthURLProtocol.setHandler(nil) }
        let firstService = service(storage: storage)
        _ = try await firstService.restore()
        do {
            try await firstService.changePassword(currentPassword: "wrong", newPassword: "newPassword123")
            Issue.record("Expected incorrect current password")
        } catch AuthError.invalidCurrentPassword {}

        AuthURLProtocol.setHandler { request in
            let url = try #require(request.url)
            return errorResponse(url: url, status: 422, code: "PASSWORD_REUSE", message: "New password must be different from the current password")
        }
        do {
            try await firstService.changePassword(currentPassword: "password123", newPassword: "password123")
            Issue.record("Expected password reuse error")
        } catch AuthError.passwordReuse {}
    }

    @Test func successfulPasswordChangeClearsLocalSecureSessionAndReturnsToGuest() async throws {
        let storage = MemoryAuthSessionStore(activeSession(access: "access-active", refresh: "refresh-active"))
        AuthURLProtocol.setHandler { request in
            let url = try #require(request.url)
            if url.path.hasSuffix("/customer/me") && request.httpMethod == "GET" {
                return customerResponse(url: url)
            }
            if url.path.hasSuffix("/customer/me/password") {
                #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer access-active")
                let body = try #require(bodyData(from: request))
                let jsonObject = try #require(JSONSerialization.jsonObject(with: body) as? [String: String])
                #expect(jsonObject["currentPassword"] == "password123")
                #expect(jsonObject["newPassword"] == "newPassword123")
                return json(url: url, headers: ["Set-Cookie": "labna_customer_refresh=; Path=/api/v1/customer/auth; HttpOnly"], body: #"{"data":{"passwordChanged":true},"meta":{"requestID":"r"}}"#)
            }
            return notFound(url: url)
        }
        defer { AuthURLProtocol.setHandler(nil) }
        let store = AuthStore(service: service(storage: storage))
        await store.restore()
        let success = await store.changePassword(currentPassword: "password123", newPassword: "newPassword123")
        #expect(success)
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

private func customerResponse(url: URL, name: String = "Demo Customer", phoneNumber: String = "+201012345678", email: String = "customer@example.com") -> (URLResponse, Data) {
    json(url: url, body: "{\"data\":{\"id\":\"customer-1\",\"name\":\"\(name)\",\"phoneNumber\":\"\(phoneNumber)\",\"email\":\"\(email)\",\"addresses\":[],\"createdAt\":\"2026-01-01T00:00:00.000Z\"},\"meta\":{\"requestID\":\"r\"}}")
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

private func bodyData(from request: URLRequest) -> Data? {
    if let body = request.httpBody { return body }
    guard let stream = request.httpBodyStream else { return nil }
    stream.open()
    defer { stream.close() }
    var data = Data()
    let bufferSize = 1024
    let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
    defer { buffer.deallocate() }
    while stream.hasBytesAvailable {
        let count = stream.read(buffer, maxLength: bufferSize)
        if count < 0 { return nil }
        if count == 0 { break }
        data.append(buffer, count: count)
    }
    return data
}

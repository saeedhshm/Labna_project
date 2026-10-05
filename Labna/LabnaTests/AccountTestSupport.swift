import Foundation
import Testing
@testable import Labna

/// Shared harness for the account tests: a stubbed `URLProtocol` backend plus a
/// memory session store, so store behaviour can be asserted without a live API.
enum AuthServiceForTests {
    enum PasswordChangeOutcome {
        case success
        case invalidCurrentPassword
        case passwordReuse
        case validation
    }

    enum ProfileUpdateOutcome {
        case success
        case network
        case validation
    }

    static func makeService() -> AuthService {
        service(storage: MemoryStore())
    }

    static func service(storage: AuthSessionStoring) -> AuthService {
        AuthService(
            baseURL: URL(string: "http://127.0.0.1:3001/api/v1")!,
            session: StubURLProtocol.makeSession(),
            storage: storage
        )
    }

    static func storageForTests() -> MemoryStore {
        MemoryStore()
    }

    /// Builds a store already signed in, with the given backend outcomes.
    @MainActor
    static func signedInStore(
        name: String = "Demo Customer",
        phoneNumber: String = "+201012345678",
        email: String = "customer@example.com",
        profileName: String = "Demo Customer",
        profilePhone: String = "+201012345678",
        profileEmail: String = "customer@example.com",
        profileUpdate: ProfileUpdateOutcome = .success,
        passwordChange: PasswordChangeOutcome = .success,
        me: AuthError = .network(.notConnectedToInternet)
    ) async -> AuthStore {
        let storage = MemoryStore()
        StubURLProtocol.handler = { request in
            let url = try #require(request.url)
            let path = url.path
            // The auth endpoints must answer realistically: a 401 from GET /me
            // makes the service attempt a refresh, so the stub has to model the
            // real exchange rather than returning an unrelated payload.
            if path.hasSuffix("/customer/auth/register"), path.contains("/auth/") {
                return authResponse(url: url, name: name, phone: phoneNumber, email: email)
            }
            if path.hasSuffix("/customer/auth/login") {
                return authResponse(url: url, name: name, phone: phoneNumber, email: email)
            }
            if path.hasSuffix("/customer/auth/refresh") {
                if case .unauthorized = me {
                    return error(url: url, status: 401, code: "UNAUTHORIZED")
                }
                return authResponse(url: url, name: name, phone: phoneNumber, email: email, accessToken: "access-refreshed")
            }
            if path.hasSuffix("/customer/auth/logout") {
                return json(url: url, body: #"{"data":{"loggedOut":true},"meta":{"requestID":"r"}}"#)
            }
            switch (request.httpMethod ?? "GET", path.hasSuffix("/customer/me"), path.hasSuffix("/customer/me/password")) {
            case ("PATCH", _, true):
                switch passwordChange {
                case .success:
                    return json(url: url, body: #"{"data":{"passwordChanged":true},"meta":{"requestID":"r"}}"#)
                case .invalidCurrentPassword:
                    return error(url: url, status: 401, code: "INVALID_CURRENT_PASSWORD")
                case .passwordReuse:
                    return error(url: url, status: 422, code: "PASSWORD_REUSE")
                case .validation:
                    return error(url: url, status: 422, code: "VALIDATION_ERROR")
                }
            case ("PATCH", true, false):
                if case .network = profileUpdate {
                    throw URLError(.notConnectedToInternet)
                }
                if case .validation = profileUpdate {
                    return error(url: url, status: 422, code: "VALIDATION_ERROR")
                }
                return json(url: url, body: customerBody(name: profileName, phone: profilePhone, email: profileEmail))
            case ("GET", true, false):
                if case .unauthorized = me {
                    return error(url: url, status: 401, code: "UNAUTHORIZED")
                }
                // A network-style failure keeps the stored customer visible.
                return json(url: url, body: customerBody(name: name, phone: phoneNumber, email: email))
            default:
                return json(url: url, body: #"{"data":[],"meta":{"requestID":"r"}}"#)
            }
        }
        let store = AuthStore(service: service(storage: storage))
        let registered = Customer(id: "customer-1", name: name, phoneNumber: phoneNumber, email: email, addresses: [], createdAt: "2026-01-01T00:00:00.000Z")
        try? storage.save(AuthSession(
            accessToken: "access-active",
            accessTokenExpiresAt: Date().addingTimeInterval(600),
            refreshCookie: "refresh-active",
            customer: registered
        ))
        await store.restore()
        return store
    }

    private static func json(url: URL, body: String) -> (URLResponse, Data) {
        (HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data(body.utf8))
    }

    private static func error(url: URL, status: Int, code: String) -> (URLResponse, Data) {
        (
            HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!,
            Data("{\"error\":{\"code\":\"\(code)\",\"message\":\"failed\"},\"meta\":{\"requestID\":\"r\"}}".utf8)
        )
    }

    /// Mirrors the real auth response, including the refresh cookie the API
    /// issues so the service can capture it.
    private static func authResponse(
        url: URL,
        name: String,
        phone: String,
        email: String,
        accessToken: String = "access-active"
    ) -> (URLResponse, Data) {
        let body = """
        {"data":{"accessToken":"\(accessToken)","expiresIn":900,
        "customer":\(customerObject(name: name, phone: phone, email: email))},
        "meta":{"requestID":"r"}}
        """
        return (
            HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: [
                "Set-Cookie": "labna_customer_refresh=refresh-active; Path=/api/v1/customer/auth; HttpOnly; SameSite=Strict",
            ])!,
            Data(body.utf8)
        )
    }

    private static func customerObject(name: String, phone: String, email: String) -> String {
        """
        {"id":"customer-1","name":"\(name)","phoneNumber":"\(phone)","email":"\(email)",
        "addresses":[],"createdAt":"2026-01-01T00:00:00.000Z"}
        """
    }

    private static func customerBody(name: String, phone: String, email: String) -> String {
        "{\"data\":\(customerObject(name: name, phone: phone, email: email)),\"meta\":{\"requestID\":\"r\"}}"
    }

    }

/// Records the persisted session so tests can assert on what was stored.
final class MemoryStore: AuthSessionStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var stored: AuthSession?

    init(_ stored: AuthSession? = nil) { self.stored = stored }

    func load() throws -> AuthSession? {
        lock.lock(); defer { lock.unlock() }
        return stored
    }

    func save(_ session: AuthSession) throws {
        lock.lock(); defer { lock.unlock() }
        stored = session
    }

    func clear() throws {
        lock.lock(); defer { lock.unlock() }
        stored = nil
    }
}

/// A `URLProtocol` whose handler the account tests install per case.
final class StubURLProtocol: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> (URLResponse, Data))?

    static func makeSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        return URLSession(configuration: configuration)
    }

    static func setHandler(_ value: ((URLRequest) throws -> (URLResponse, Data))?) {
        lock.lock(); defer { lock.unlock() }
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

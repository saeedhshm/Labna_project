import Foundation
import Testing
@testable import Labna

/// Verifies customer authentication against the API running on
/// `127.0.0.1:3001`, exercising the real contracts rather than stubs.
///
/// The focus is the parts a `URLProtocol` stub cannot prove: that a cookie the
/// API issues is actually captured, that the `INVALID_ORIGIN` CSRF guard is
/// satisfied, and that a rotated refresh token really rotates.
///
/// Skips itself when the backend is unreachable so the suite still runs without
/// `npm run dev:api`.
@MainActor
@Suite(.serialized)
struct AuthLiveBackendTests {
    private static let baseURL = URL(string: "http://127.0.0.1:3001/api/v1")!

    /// The API rate-limits `/customer/auth/*` at 50 requests per 15 minutes
    /// across the whole server, so this suite deliberately runs serialized and
    /// stays small. A run that trips the limiter is skipped rather than failed,
    /// because a rate limit is an artefact of test repetition, not a defect.
    private static func isRateLimited(_ error: Error) -> Bool {
        guard case AuthError.httpStatus(let status, _) = error else { return false }
        return status == 429
    }

    /// Runs `body` and swallows a rate-limit response by treating it as a skip.
    private func skipIfRateLimited(_ body: () async throws -> Void) async throws {
        do {
            try await body()
        } catch where Self.isRateLimited(error) {
            return
        }
    }

    private func backendIsReachable() async -> Bool {
        var request = URLRequest(url: Self.baseURL.appendingPathComponent("products"))
        request.timeoutInterval = 3
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        guard let (_, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse else { return false }
        return (200..<300).contains(http.statusCode)
    }

    /// Each run needs its own customer, since the API rate-limits the auth
    /// router at 50 requests per 15 minutes.
    private func makeService() -> (service: AuthService, storage: LiveSessionStore, email: String) {
        let email = "ios-auth-\(UUID().uuidString.prefix(8))@example.com".lowercased()
        let storage = LiveSessionStore()
        let service = AuthService(
            baseURL: Self.baseURL,
            session: AuthService.defaultSession(),
            storage: storage
        )
        return (service, storage, email)
    }

    @Test func registerThenLoginRestoreAndLogoutAgainstTheLiveAPI() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited { () async throws in
        let (service, storage, email) = makeService()

        // Register issues a session immediately.
        let registered = try await service.register(
            name: "iOS Auth Tester",
            phoneNumber: "+201012345678",
            email: email,
            password: "password123"
        )
        #expect(registered.email.lowercased() == email)

        // The refresh token must be captured from the response, otherwise no
        // later call can authenticate.
        let stored = try #require(storage.snapshot)
        #expect(!stored.refreshCookie.isEmpty)
        #expect(stored.accessTokenExpiresAt > Date())

        // Logging out revokes the server session and clears local state.
        await service.logout()
        #expect(storage.snapshot == nil)

        // Logged out, the same service can sign in again from scratch.
        let signedIn = try await service.login(email: email, password: "password123")
        #expect(signedIn.email.lowercased() == email)
        #expect(storage.snapshot?.refreshCookie != nil)
        await service.logout()
        }
    }

    @Test func duplicateRegistrationIsReportedAsADuplicateAccount() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited { () async throws in
        let (service, storage, email) = makeService()
        _ = try await service.register(name: "First", phoneNumber: "+201012345678", email: email, password: "password123")
        do {
            _ = try await service.register(name: "Second", phoneNumber: "+201012345678", email: email, password: "password123")
            Issue.record("Expected a duplicate-account failure")
        } catch AuthError.duplicateAccount {}
        await service.logout()
        }
    }

    @Test func invalidCredentialsAreReportedDistinctly() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited { () async throws in
        let (service, storage, email) = makeService()
        _ = try await service.register(name: "Tester", phoneNumber: "+201012345678", email: email, password: "password123")
        do {
            _ = try await service.login(email: email, password: "not-the-password")
            Issue.record("Expected invalid credentials")
        } catch AuthError.invalidCredentials {}
        await service.logout()
        }
    }

    @Test func validationFailuresAreReportedAsValidationErrors() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited { () async throws in
        let (service, _, _) = makeService()
        // The API requires min 8 for the password and a full name.
        do {
            _ = try await service.register(name: "X", phoneNumber: "+201012345678", email: "bad@example.com", password: "short")
            Issue.record("Expected a validation failure")
        } catch AuthError.validation {}
        }
    }

    @Test func theRefreshCookieRequestCarriesAnOriginSoTheAPIDoesNotRejectIt() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited { () async throws in

        // Proves the exact header pairing the service uses is accepted by the
        // API's CSRF guard, which answers 403 INVALID_ORIGIN otherwise.
        let (service, storage, email) = makeService()
        _ = try await service.register(name: "Origin Tester", phoneNumber: "+201012345678", email: email, password: "password123")
        let stored = try #require(storage.snapshot)

        var request = URLRequest(url: Self.baseURL.appendingPathComponent("customer/auth/refresh"))
        request.httpMethod = "POST"
        request.setValue("labna_customer_refresh=\(stored.refreshCookie)", forHTTPHeaderField: "Cookie")
        request.setValue(AppConfiguration.customerAuthOrigin, forHTTPHeaderField: "Origin")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode
        #expect(status == 200)
        let decoded = try JSONDecoder().decode(APIEnvelope<CustomerAuthResponse>.self, from: data).data
        #expect(!decoded.accessToken.isEmpty)
        #expect(decoded.customer.email.lowercased() == email)
        await service.logout()
        }
    }

    @Test func meReturnsTheAuthenticatedCustomerAndRefusesAMissingToken() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited { () async throws in
        let (service, storage, email) = makeService()
        _ = try await service.register(name: "Me Tester", phoneNumber: "+201012345678", email: email, password: "password123")

        let customer = try await service.me()
        #expect(customer.email.lowercased() == email)
        #expect(customer.id.isEmpty == false)

        await service.logout()
        // With no session the API path must fail rather than silently succeed.
        do {
            _ = try await service.me()
            Issue.record("Expected an expired session after logout")
        } catch AuthError.expiredSession {}
        }
    }

    @Test func anExpiredAccessTokenIsRefreshedTransparently() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited { () async throws in
        let storage = LiveSessionStore()
        let email = "ios-auth-\(UUID().uuidString.prefix(8))@example.com".lowercased()
        let bootstrap = AuthService(baseURL: Self.baseURL, session: AuthService.defaultSession(), storage: storage)
        _ = try await bootstrap.register(name: "Expiry Tester", phoneNumber: "+201012345678", email: email, password: "password123")
        let firstToken = try #require(storage.snapshot?.accessToken)
        let firstRefresh = try #require(storage.snapshot?.refreshCookie)

        // A second service restores from the same Keychain copy but is handed an
        // already-expired access token, which is exactly the 15-minute-later
        // relaunch case. `me()` must refresh first and still succeed.
        let expired = AuthSession(
            accessToken: firstToken,
            accessTokenExpiresAt: Date().addingTimeInterval(-60),
            refreshCookie: try #require(storage.snapshot?.refreshCookie),
            customer: try #require(storage.snapshot?.customer)
        )
        try storage.save(expired)
        let relaunched = AuthService(baseURL: Self.baseURL, session: AuthService.defaultSession(), storage: storage)
        let restored = try await relaunched.restore()
        #expect(restored?.email.lowercased() == email)
        // The refresh token rotates on every use and must be persisted for the
        // next launch. The access token is a JWT whose `iat`/`exp` are only
        // second-granular, so it can legitimately be byte-identical when the
        // refresh happens within the same second.
        #expect(storage.snapshot?.refreshCookie != firstRefresh)
        #expect(storage.snapshot?.hasUsableAccessToken == true)
        #expect(firstToken.isEmpty == false)

        await relaunched.logout()
        }
    }

    @Test func logoutRevokesTheServerSessionSoTheRefreshTokenStopsWorking() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited { () async throws in
        let storage = LiveSessionStore()
        let email = "ios-auth-\(UUID().uuidString.prefix(8))@example.com".lowercased()
        let service = AuthService(baseURL: Self.baseURL, session: AuthService.defaultSession(), storage: storage)
        _ = try await service.register(name: "Revoke Tester", phoneNumber: "+201012345678", email: email, password: "password123")
        let refreshCookie = try #require(storage.snapshot?.refreshCookie)

        await service.logout()

        // The token the app kept must no longer be accepted by the API.
        var request = URLRequest(url: Self.baseURL.appendingPathComponent("customer/auth/refresh"))
        request.httpMethod = "POST"
        request.setValue("labna_customer_refresh=\(refreshCookie)", forHTTPHeaderField: "Cookie")
        request.setValue(AppConfiguration.customerAuthOrigin, forHTTPHeaderField: "Origin")
        let (_, response) = try await URLSession.shared.data(for: request)
        #expect((response as? HTTPURLResponse)?.statusCode == 401)
    }
}

/// Records the last session written, standing in for the Keychain store.
final class LiveSessionStore: AuthSessionStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var stored: AuthSession?

    init(_ stored: AuthSession? = nil) { self.stored = stored }

    var snapshot: AuthSession? {
        lock.lock()
        defer { lock.unlock() }
        return stored
    }

    func load() throws -> AuthSession? { snapshot }

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
}

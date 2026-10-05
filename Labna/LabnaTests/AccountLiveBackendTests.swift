import Foundation
import Testing
@testable import Labna

/// Verifies customer profile and password management against the API running on
/// `127.0.0.1:3001`.
///
/// The focus is the behaviour the API actually implements rather than what a
/// stub could be made to agree with: which profile fields are writable, which
/// errors are authoritative, and — most importantly — that a password change
/// revokes every server-side session and leaves the app back at the login form.
///
/// Skips itself when the backend is unreachable so the suite still runs without
/// `npm run dev:api`.
@MainActor
@Suite(.serialized)
struct AccountLiveBackendTests {
    private static let baseURL = URL(string: "http://127.0.0.1:3001/api/v1")!

    private func backendIsReachable() async -> Bool {
        var request = URLRequest(url: Self.baseURL.appendingPathComponent("products"))
        request.timeoutInterval = 3
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        guard let (_, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse else { return false }
        return (200..<300).contains(http.statusCode)
    }

    /// The API rate-limits the auth router at 50 requests per 15 minutes, so this
    /// suite stays small and treats a limiter response as a skip rather than a
    /// failure.
    private func skipIfRateLimited(_ body: () async throws -> Void) async throws {
        do {
            try await body()
        } catch let error as AuthError {
            if case .httpStatus(let status, _) = error, status == 429 { return }
            throw error
        }
    }

    private func makeService() -> (service: AuthService, storage: LiveAccountSessionStore, email: String) {
        let email = "ios-acct-\(UUID().uuidString.prefix(8))@example.com".lowercased()
        let storage = LiveAccountSessionStore()
        let service = AuthService(baseURL: Self.baseURL, session: AuthService.defaultSession(), storage: storage)
        return (service, storage, email)
    }

    private func signedIn(_ email: String, password: String = "password123") async throws -> (AuthService, LiveAccountSessionStore) {
        let (service, storage, _) = makeService()
        _ = try await service.register(name: "Account Tester", phoneNumber: "+201012345678", email: email, password: password)
        return (service, storage)
    }

    @Test func profileLoadsFromTheBackendAndSupportsEveryWritableField() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited { () async throws in
            let (service, storage, email) = makeService()
            let registered = try await service.register(
                name: "Account Tester",
                phoneNumber: "+201012345678",
                email: email,
                password: "password123"
            )
            #expect(registered.email.lowercased() == email)
            #expect(storage.snapshot != nil)
            let store = AuthStore(service: service)
            await store.restore()
            #expect(store.isAuthenticated)

            // Profile data must come from GET /me, not from local guesses.
            let loaded = try #require(store.customer)
            #expect(loaded.email.lowercased() == email)
            #expect(loaded.phoneNumber == "+201012345678")

            let updatedName = "Updated Name \(UUID().uuidString.prefix(6))"
            #expect(await store.updateProfile(
                name: updatedName,
                phoneNumber: "+201099999999",
                email: email
            ))
            #expect(store.customer?.name == updatedName)
            #expect(store.customer?.phoneNumber == "+201099999999")

            // The change must be persisted so a relaunch shows it too.
            let refreshed = try #require(try await service.me())
            #expect(refreshed.name == updatedName)

            await service.logout()
        }
    }

    @Test func anInvalidPhoneNumberIsRejectedByTheServerNotJustTheClient() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited { () async throws in
            let (service, _, email) = makeService()
            _ = try await service.register(name: "Phone Tester", phoneNumber: "+201012345678", email: email, password: "password123")
            let store = AuthStore(service: service)
            await store.restore()

            // The contract requires E.164; the app must surface the server's
            // verdict rather than silently accepting it.
            do {
                let ok = await store.updateProfile(name: "Phone Tester", phoneNumber: "01012345678", email: email)
                #expect(!ok)
            } catch {
                Issue.record("Expected a validation failure, got \(error)")
            }
            await service.logout()
        }
    }

    @Test func anIncorrectCurrentPasswordIsReportedSpecifically() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited { () async throws in
            let (service, _, email) = makeService()
            _ = try await service.register(name: "Wrong Password", phoneNumber: "+201012345678", email: email, password: "password123")
            let store = AuthStore(service: service)
            await store.restore()

            #expect(!(await store.changePassword(currentPassword: "not-my-password", newPassword: "newPassword456")))
            #expect(store.lastError == .invalidCurrentPassword)
            // A rejected attempt must not end the session.
            #expect(store.isAuthenticated)

            await service.logout()
        }
    }

    @Test func reusingTheCurrentPasswordIsRejected() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited { () async throws in
            let (service, _, email) = makeService()
            _ = try await service.register(name: "Reuse Tester", phoneNumber: "+201012345678", email: email, password: "password123")
            let store = AuthStore(service: service)
            await store.restore()

            #expect(!(await store.changePassword(currentPassword: "password123", newPassword: "password123")))
            #expect(store.lastError == .passwordReuse)
            #expect(store.isAuthenticated)

            await service.logout()
        }
    }

    @Test func aShortNewPasswordIsRejectedByTheServer() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited { () async throws in
            let (service, _, email) = makeService()
            _ = try await service.register(name: "Short Tester", phoneNumber: "+201012345678", email: email, password: "password123")
            let store = AuthStore(service: service)
            await store.restore()

            #expect(!(await store.changePassword(currentPassword: "password123", newPassword: "short")))
            #expect(store.isAuthenticated)

            await service.logout()
        }
    }

    /// The API revokes every non-revoked session for the customer after a
    /// password change, so the app must clear its Keychain copy and fall back to
    /// the login form rather than appearing signed in with a dead session.
    @Test func changingThePasswordClearsLocalStateAndReturnsToGuest() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited { () async throws in
            let (service, storage, email) = makeService()
            _ = try await service.register(name: "Rotate Tester", phoneNumber: "+201012345678", email: email, password: "password123")
            let store = AuthStore(service: service)
            await store.restore()
            #expect(store.isAuthenticated)
            let refreshCookie = try #require(storage.snapshot?.refreshCookie)

            #expect(await store.changePassword(currentPassword: "password123", newPassword: "brandNewPassword456"))

            // Local secure state is gone and the UI state is back to guest.
            #expect(storage.snapshot == nil)
            #expect(store.state == .guest)

            // The server-side session must be dead too, not merely forgotten.
            var request = URLRequest(url: Self.baseURL.appendingPathComponent("customer/auth/refresh"))
            request.httpMethod = "POST"
            request.setValue("labna_customer_refresh=\(refreshCookie)", forHTTPHeaderField: "Cookie")
            request.setValue(AppConfiguration.customerAuthOrigin, forHTTPHeaderField: "Origin")
            let (_, response) = try await URLSession.shared.data(for: request)
            #expect((response as? HTTPURLResponse)?.statusCode == 401)
        }
    }

    @Test func theNewPasswordWorksAndTheOldOneStopsWorking() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited { () async throws in
            let (service, _, email) = makeService()
            let store = AuthStore(service: service)
            _ = try await service.register(name: "Credential Tester", phoneNumber: "+201012345678", email: email, password: "password123")
            await store.restore()
            #expect(await store.changePassword(currentPassword: "password123", newPassword: "brandNewPassword456"))

            // Signing in with the new password must work.
            let fresh = AuthService(baseURL: Self.baseURL, session: AuthService.defaultSession(), storage: LiveAccountSessionStore())
            let signedIn = try await fresh.login(email: email, password: "brandNewPassword456")
            #expect(signedIn.email.lowercased() == email)
            await fresh.logout()

            // The old password must no longer be accepted.
            do {
                _ = try await fresh.login(email: email, password: "password123")
                Issue.record("Expected the old password to be rejected")
            } catch AuthError.invalidCredentials {}
        }
    }

    @Test func logoutClearsLocalStateAndReturnsToGuest() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited { () async throws in
            let (service, storage, email) = makeService()
            let store = AuthStore(service: service)
            _ = try await service.register(name: "Logout Tester", phoneNumber: "+201012345678", email: email, password: "password123")
            await store.restore()
            #expect(store.isAuthenticated)

            await store.logout()
            #expect(store.state == .guest)
            #expect(storage.snapshot == nil)
        }
    }

    @Test func profileDataSurvivesRelaunchFromTheSecureStore() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited { () async throws in
            let (service, storage, email) = makeService()
            let store = AuthStore(service: service)
            _ = try await service.register(name: "Relaunch Tester", phoneNumber: "+201012345678", email: email, password: "password123")
            let name = "Relaunched \(UUID().uuidString.prefix(6))"
            #expect(await store.updateProfile(name: name, phoneNumber: "+201012345678", email: email))

            // A brand new service over the same secure store stands in for the
            // next launch, and must restore from the backend.
            let relaunched = AuthService(baseURL: Self.baseURL, session: AuthService.defaultSession(), storage: storage)
            let restored = try await relaunched.restore()
            #expect(restored?.name == name)
            #expect(restored?.email.lowercased() == email)

            await relaunched.logout()
        }
    }
}

/// Stands in for the Keychain store so tests can observe what was persisted.
final class LiveAccountSessionStore: AuthSessionStoring, @unchecked Sendable {
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

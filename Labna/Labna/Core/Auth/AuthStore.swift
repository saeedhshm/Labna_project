import Foundation
import Observation

enum AuthState: Equatable {
    case unknown
    case guest
    case authenticated(Customer)
}

@MainActor
@Observable
final class AuthStore {
    private let service: AuthService
    private(set) var state: AuthState = .unknown
    private(set) var isLoading = false
    var lastError: AuthError?

    init(service: AuthService) {
        self.service = service
    }

    var customer: Customer? {
        if case .authenticated(let customer) = state { customer } else { nil }
    }

    var isAuthenticated: Bool { customer != nil }

    func restore() async {
        guard state == .unknown else { return }
        await run {
            if let customer = try await service.restore() {
                state = .authenticated(customer)
            } else {
                state = .guest
            }
        }
    }

    func login(email: String, password: String) async {
        await run {
            let customer = try await service.login(email: email.trimmingCharacters(in: .whitespacesAndNewlines), password: password)
            state = .authenticated(customer)
        }
    }

    func register(name: String, phoneNumber: String, email: String, password: String) async {
        await run {
            let customer = try await service.register(
                name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                phoneNumber: phoneNumber.trimmingCharacters(in: .whitespacesAndNewlines),
                email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                password: password
            )
            state = .authenticated(customer)
        }
    }

    func refreshCustomer() async {
        guard isAuthenticated else { return }
        await run {
            let customer = try await service.me()
            state = .authenticated(customer)
        }
    }

    @discardableResult
    func updateProfile(name: String, phoneNumber: String, email: String) async -> Bool {
        await runReturningSuccess {
            let customer = try await service.updateProfile(
                name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                phoneNumber: phoneNumber.trimmingCharacters(in: .whitespacesAndNewlines),
                email: email.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            state = .authenticated(customer)
        }
    }

    @discardableResult
    func changePassword(currentPassword: String, newPassword: String) async -> Bool {
        await runReturningSuccess {
            try await service.changePassword(currentPassword: currentPassword, newPassword: newPassword)
            state = .guest
        }
    }

    func logout() async {
        isLoading = true
        await service.logout()
        state = .guest
        lastError = nil
        isLoading = false
    }

    private func run(_ operation: () async throws -> Void) async {
        _ = await runReturningSuccess(operation)
    }

    private func runReturningSuccess(_ operation: () async throws -> Void) async -> Bool {
        isLoading = true
        lastError = nil
        do {
            try await operation()
            isLoading = false
            return true
        } catch let error as AuthError {
            if error == .expiredSession || error == .unauthorized { state = .guest }
            lastError = error
        } catch {}
        isLoading = false
        return false
    }
}

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

    func logout() async {
        isLoading = true
        await service.logout()
        state = .guest
        lastError = nil
        isLoading = false
    }

    private func run(_ operation: () async throws -> Void) async {
        isLoading = true
        lastError = nil
        do {
            try await operation()
        } catch let error as AuthError {
            if error == .expiredSession || error == .unauthorized { state = .guest }
            lastError = error
        } catch {}
        isLoading = false
    }
}

import Foundation
import Observation

/// Loads and mutates the signed-in customer's saved addresses.
///
/// Every request goes through `AuthService`, which attaches the session's
/// Bearer token; the API derives ownership from that token, so no customer id
/// is ever sent by the client. Mutation responses are applied locally the same
/// way the API normalizes the list (only one default address), and the shared
/// copy on `AuthStore` is kept in step so checkout can read it later.
@MainActor
@Observable
final class AddressesStore {
    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed(AuthError)
    }

    enum Mutation: Equatable {
        case save
        case delete(String)
        case setDefault(String)
    }

    private let service: AuthService
    private let auth: AuthStore

    private(set) var phase: Phase = .idle
    private(set) var addresses: [CustomerAddress] = []
    private(set) var mutation: Mutation?
    private(set) var notice: String?
    private(set) var lastError: AuthError?

    init(service: AuthService, auth: AuthStore) {
        self.service = service
        self.auth = auth
    }

    var isEmpty: Bool {
        addresses.isEmpty
    }

    var isSaving: Bool {
        mutation == .save
    }

    func isDeleting(_ id: String) -> Bool {
        mutation == .delete(id)
    }

    func isSettingDefault(_ id: String) -> Bool {
        mutation == .setDefault(id)
    }

    func loadIfNeeded() async {
        guard phase == .idle else { return }
        await load()
    }

    func load() async {
        if addresses.isEmpty {
            phase = .loading
        }
        lastError = nil
        do {
            apply(try await service.addresses())
            phase = .loaded
        } catch is CancellationError {
            if addresses.isEmpty {
                phase = .idle
            }
        } catch let error as AuthError {
            fail(error)
        } catch {
            fail(.invalidResponse)
        }
    }

    func add(_ input: CustomerAddressInput) async -> Bool {
        await perform(.save, notice: "addresses.saved") {
            try await self.service.createAddress(input)
        }
    }

    func update(id: String, input: CustomerAddressInput) async -> Bool {
        await perform(.save, notice: "addresses.saved") {
            try await self.service.updateAddress(id: id, input: input)
        }
    }

    func delete(id: String) async -> Bool {
        lastError = nil
        notice = nil
        mutation = .delete(id)
        defer { mutation = nil }
        do {
            // The API answers with the whole normalized list, so no local
            // bookkeeping is needed beyond taking it as-is.
            apply(try await service.deleteAddress(id: id))
            notice = "addresses.deleted"
            return true
        } catch is CancellationError {
            return false
        } catch let error as AuthError {
            fail(error)
        } catch {
            fail(.invalidResponse)
        }
        return false
    }

    func setDefault(id: String) async -> Bool {
        lastError = nil
        notice = nil
        mutation = .setDefault(id)
        defer { mutation = nil }
        do {
            let address = try await service.setDefaultAddress(id: id)
            apply(addresses.inserting(address))
            notice = "addresses.defaultUpdated"
            return true
        } catch is CancellationError {
            return false
        } catch let error as AuthError {
            fail(error)
        } catch {
            fail(.invalidResponse)
        }
        return false
    }

    func clearNotice() {
        notice = nil
    }

    /// Clears a stale failure before a new interaction starts, so an old error
    /// is never shown as if it belonged to the action the user just took.
    func clearError() {
        lastError = nil
    }

    private func perform(
        _ mutation: Mutation,
        notice: String,
        _ operation: () async throws -> CustomerAddress
    ) async -> Bool {
        lastError = nil
        self.notice = nil
        if addresses.isEmpty && phase != .loaded {
            await load()
            guard phase == .loaded else { return false }
        }
        self.mutation = mutation
        defer { self.mutation = nil }
        do {
            let address = try await operation()
            apply(addresses.inserting(address))
            self.notice = notice
            return true
        } catch is CancellationError {
            return false
        } catch let error as AuthError {
            fail(error)
        } catch {
            fail(.invalidResponse)
        }
        return false
    }

    private func apply(_ list: [CustomerAddress]) {
        addresses = list
        if phase == .idle {
            phase = .loaded
        }
        auth.updateAddresses(list)
    }

    private func fail(_ error: AuthError) {
        lastError = error
        if addresses.isEmpty {
            phase = .failed(error)
        }
        if error == .unauthorized || error == .expiredSession {
            auth.markSessionExpired()
        }
    }
}

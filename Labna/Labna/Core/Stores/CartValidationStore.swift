import Foundation
import Observation

/// Holds the server's verdict for the current cart contents.
///
/// The cart itself stays local and offline-capable: `CartStore` keeps owning the
/// persisted lines and the price captured when each line was added. This store
/// only records what the backend last said, so the UI can be explicit about the
/// difference between "cached on this device" and "confirmed by the server".
///
/// Any change to the cart contents invalidates the previous verdict, because it
/// no longer describes what would be checked out.
@MainActor
@Observable
final class CartValidationStore {
    enum Phase: Equatable {
        case idle
        case validating
        case validated(CartValidationResult)
        case failed(CartValidationError)
    }

    private let service: CartValidationService
    private let cart: CartStore
    private(set) var phase: Phase = .idle
    private(set) var lastError: CartValidationError?
    private var verdicts: [CartItem.ID: CartValidatedItem] = [:]
    private var validatedContents: [CartContentKey] = []
    private var inFlight: Task<CartValidationResult, Error>?

    init(service: CartValidationService, cart: CartStore) {
        self.service = service
        self.cart = cart
    }

    var isValidating: Bool {
        if case .validating = phase { return true }
        return inFlight != nil
    }

    /// True only while the stored verdict still describes the cart on screen,
    /// whether or not the server approved it.
    var isServerValidated: Bool {
        guard case .validated = phase else { return false }
        return validatedContents == contentKeys
    }

    /// The validated result, or `nil` once it stops matching the cart.
    var result: CartValidationResult? {
        isServerValidated ? storedResult : nil
    }

    var subtotalMinor: Int? { result?.subtotalMinor }
    var currencyCode: String? { result?.currencyCode }
    var blockingItems: [CartValidatedItem] { result?.blockingItems ?? [] }

    /// Checkout is only offered once the server has confirmed the exact cart
    /// contents and reported no blocking problems.
    var isCheckoutReady: Bool {
        guard let result else { return false }
        return result.valid && result.blockingItems.isEmpty
    }

    func verdict(for id: CartItem.ID) -> CartValidatedItem? {
        guard isServerValidated else { return nil }
        return verdicts[id]
    }

    /// Confirms the cart against `/cart/validate`, coalescing concurrent calls so
    /// one cart never fans out into several requests.
    ///
    /// - Returns: whether the cart is now confirmed and free of blocking
    ///   problems, i.e. whether checkout may be offered.
    @discardableResult
    func validate() async -> Bool {
        let items = cart.items.filter { $0.quantity > 0 }
        guard !items.isEmpty else {
            reset()
            return false
        }
        let contents = contentKeys(for: items)
        if isServerValidated, validatedContents == contents { return isCheckoutReady }

        if let inFlight {
            do {
                let outcome = try await inFlight.value
                apply(outcome, for: contents)
                return isCheckoutReady
            } catch {
                fail(map(error))
                return false
            }
        }

        let task = Task<CartValidationResult, Error> { try await service.validate(items: items) }
        inFlight = task
        phase = .validating
        lastError = nil
        do {
            let outcome = try await task.value
            try Task.checkCancellation()
            apply(outcome, for: contents)
            return isCheckoutReady
        } catch is CancellationError {
            return false
        } catch {
            fail(map(error))
            return false
        }
    }

    func reset() {
        inFlight?.cancel()
        inFlight = nil
        verdicts = [:]
        validatedContents = []
        phase = .idle
        lastError = nil
    }

    private var storedResult: CartValidationResult? {
        if case .validated(let result) = phase { return result }
        return nil
    }

    private var contentKeys: [CartContentKey] {
        contentKeys(for: cart.items)
    }

    private func contentKeys(for items: [CartItem]) -> [CartContentKey] {
        items.map(CartContentKey.init)
    }

    private func apply(_ result: CartValidationResult, for contents: [CartContentKey]) {
        verdicts = Dictionary(uniqueKeysWithValues: result.items.map { ($0.line, $0) })
        validatedContents = contents
        phase = .validated(result)
        lastError = nil
        inFlight = nil
    }

    private func fail(_ error: CartValidationError) {
        lastError = error
        verdicts = [:]
        validatedContents = []
        phase = .failed(error)
        inFlight = nil
    }

    private func map(_ error: Error) -> CartValidationError {
        error as? CartValidationError ?? .invalidResponse
    }
}

/// Identifies one cart line's server-relevant contents so a stale verdict can be
/// detected after any add, remove or quantity change.
struct CartContentKey: Equatable, Hashable, Sendable {
    let productID: String
    let variantID: String
    let quantity: Int

    init(productID: String, variantID: String, quantity: Int) {
        self.productID = productID
        self.variantID = variantID
        self.quantity = quantity
    }

    init(_ item: CartItem) {
        self.init(productID: item.productID, variantID: item.variantID, quantity: item.quantity)
    }
}
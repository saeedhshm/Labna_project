import Foundation
import Observation

/// Drives the real checkout: it collects the shopper's selections, re-checks the
/// cart against the server immediately before submitting, creates one order, and
/// only then clears the cart.
///
/// The device never decides pricing or availability. Everything money related on
/// screen comes from `CartValidationStore` (server subtotal) or from the created
/// order; this type only sends identifiers, quantities and the customer's own
/// choices.
@MainActor
@Observable
final class CheckoutStore {
    enum Phase: Equatable {
        case idle
        case validating
        case submitting
        case failed(CheckoutFailure)
    }

    private let service: AuthService
    private let auth: AuthStore
    private let cart: CartStore
    private let cartValidation: CartValidationStore

    private(set) var phase: Phase = .idle
    private(set) var failure: CheckoutFailure?
    private(set) var placedOrder: PlacedOrder?

    /// Contact details, prefilled from the signed-in customer.
    private(set) var contact = ProfileDraft(name: "", phoneNumber: "", email: "")
    private(set) var couponCode = ""
    private(set) var paymentMethod: PaymentMethod = .cashOnDelivery

    /// Guards against a double submit: the button, the task and the guard all
    /// check this, so a fast double tap cannot create two orders.
    private var submission: Task<PlacedOrder?, Never>?
    private(set) var selectedAddressID: String?

    init(service: AuthService, auth: AuthStore, cart: CartStore, cartValidation: CartValidationStore) {
        self.service = service
        self.auth = auth
        self.cart = cart
        self.cartValidation = cartValidation
    }

    var isBusy: Bool {
        if case .validating = phase { return true }
        return submission != nil
    }

    var isSubmitting: Bool {
        if case .submitting = phase { return true }
        return false
    }

    /// Preloads the form from the session. Called when the review screen appears
    /// so an authenticated shopper does not retype their own details.
    func prepare() {
        guard case .idle = phase else { return }
        if let customer = auth.customer, contact.name.isEmpty {
            contact = ProfileDraft(customer: customer)
        }
        if selectedAddressID == nil {
            // Prefer the default saved address, which is what the API would use
            // for a returning shopper anyway.
            selectedAddressID = auth.customer?.addresses.defaultAddressID()
                ?? auth.customer?.addresses.first?.id
        }
    }

    // MARK: - Selections

    func select(addressID: String?) {
        selectedAddressID = addressID
        failure = nil
    }

    func updateContact(_ draft: ProfileDraft) {
        contact = draft
        failure = nil
    }

    func updateCoupon(_ code: String) {
        couponCode = code
        failure = nil
    }

    func updatePaymentMethod(_ method: PaymentMethod) {
        paymentMethod = method
        failure = nil
    }

    var selectedAddress: CustomerAddress? {
        guard let selectedAddressID else { return nil }
        return auth.customer?.addresses.first { $0.id == selectedAddressID }
    }

    /// Maps the chosen saved address onto the stricter `checkoutAddress` shape,
    /// keeping the address notes and the shopper's own notes.
    private func addressPayload(notes: String) -> CheckoutAddress? {
        guard let address = selectedAddress else { return nil }
        let trimmedNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        let combined = [address.notes?.trimmingCharacters(in: .whitespacesAndNewlines), trimmedNotes]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: "\n")
        return CheckoutAddress(
            city: address.city,
            area: address.area,
            street: address.street,
            building: address.building,
            floor: address.floor ?? "",
            apartment: address.apartment ?? "",
            // The contract caps notes at 500 characters.
            notes: String(combined.prefix(500))
        )
    }

    /// Everything that must be true before the order button does anything.
    var blockingReason: CheckoutFailure? {
        if cart.items.isEmpty { return .emptyCart }
        if selectedAddress == nil { return .missingAddress }
        if !contact.isValid { return .invalidContact }
        return nil
    }

    // MARK: - Submission

    /// Re-validates the cart against the server and, only if it still agrees,
    /// creates the order.
    ///
    /// - Returns: the created order, or `nil` when the attempt was refused. The
    ///   reason is left in `failure` for the screen to render.
    @discardableResult
    func submit(notes: String) async -> PlacedOrder? {
        // Duplicate submission guard. The flag and the task are both installed
        // synchronously, before the first `await`, so a second tap landing in the
        // same run loop cannot start a parallel validation and a second order.
        if let existing = submission {
            return try? await existing.value
        }
        let task = Task<PlacedOrder?, Never> { await placeOrder(notes: notes) }
        submission = task
        let result = await task.value
        submission = nil
        return result
    }

    private func placeOrder(notes: String) async -> PlacedOrder? {
        // Clear the previous attempt's reason so an old error is never shown as
        // if it belonged to the retry.
        failure = nil
        phase = .validating
        if let reason = blockingReason {
            fail(reason)
            return nil
        }

        // Authoritative check immediately before submission: prices, stock and
        // availability may all have moved since the review screen opened.
        let confirmed = await cartValidation.validate()
        guard confirmed, cartValidation.isCheckoutReady else {
            // The validation store already holds the specific line problem.
            fail(.cartNotConfirmed(cartValidation.blockingItems.map(\.reason)))
            return nil
        }

        guard let address = addressPayload(notes: notes) else {
            fail(.missingAddress)
            return nil
        }

        let items = cart.items
        guard !items.isEmpty else {
            fail(.emptyCart)
            return nil
        }

        let request = CheckoutRequest(
            customer: CheckoutCustomer(
                name: contact.name.trimmed,
                phoneNumber: contact.phoneNumber.trimmed,
                email: contact.email.trimmed.nilIfEmpty
            ),
            address: address,
            branchID: nil,
            items: items.map {
                CheckoutRequestItem(productID: $0.productID, variantID: $0.variantID, quantity: $0.quantity)
            },
            couponCode: couponCode.trimmed.uppercased(),
            paymentMethod: paymentMethod
        )

        phase = .submitting
        do {
            let order = try await service.createOrder(request)
            try Task.checkCancellation()
            placedOrder = order
            phase = .idle
            // Only a confirmed order clears the cart, so a failed attempt can be
            // retried without rebuilding it.
            cart.removeAll()
            cartValidation.reset()
            return order
        } catch is CancellationError {
            phase = .idle
            return nil
        } catch let error as AuthError {
            fail(map(error))
            if error.terminatesSession {
                auth.markSessionExpired()
            }
            return nil
        } catch {
            fail(.server)
            return nil
        }
    }

    private func fail(_ reason: CheckoutFailure) {
        failure = reason
        phase = .failed(reason)
    }

    private func map(_ error: AuthError) -> CheckoutFailure {
        switch error {
        case .checkout(let rejection):
            return .rejected(rejection)
        case .unauthorized, .expiredSession:
            return .sessionExpired
        case .network(let code):
            return code == .notConnectedToInternet
                || code == .networkConnectionLost
                || code == .cannotFindHost
                || code == .cannotConnectToHost
                ? .offline
                : .server
        case .invalidBaseURL:
            return .configuration
        default:
            return .server
        }
    }
}

/// Why a checkout attempt could not produce an order.
enum CheckoutFailure: Equatable {
    case emptyCart
    case missingAddress
    case invalidContact
    case cartNotConfirmed([CartValidationReason])
    case rejected(CheckoutRejection)
    case sessionExpired
    case offline
    case server
    case configuration

    var messageKey: String {
        switch self {
        case .emptyCart: "checkout.error.empty"
        case .missingAddress: "checkout.error.missingAddress"
        case .invalidContact: "checkout.error.invalidContact"
        case .cartNotConfirmed: "checkout.error.cartChanged"
        case .rejected(let rejection): rejection.messageKey
        case .sessionExpired: "checkout.error.sessionExpired"
        case .offline: "checkout.error.offline"
        case .server: "checkout.error.server"
        case .configuration: "checkout.error.configuration"
        }
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
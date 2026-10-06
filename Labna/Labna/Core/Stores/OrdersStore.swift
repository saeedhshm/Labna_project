import Foundation
import Observation

/// Order history and tracking for the signed-in customer.
///
/// Every order shown here came from `GET /customer/orders`, which the API scopes
/// to the session's customer, so the app never asks for anybody else's orders.
/// Refreshing is how an Admin-side status change reaches the device: the store
/// re-reads the server rather than guessing at a transition locally.
@MainActor
@Observable
final class OrdersStore {
    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case loadingMore
        case failed(OrdersError)
    }

    private let service: AuthService
    private let auth: AuthStore

    private(set) var phase: Phase = .idle
    private(set) var orders: [PlacedOrder] = []
    private(set) var nextCursor: String?
    private(set) var lastError: OrdersError?

    /// Orders currently being opened, keyed by the identifier used in the URL.
    private(set) var details: [String: PlacedOrder] = [:]
    private(set) var detailPhases: [String: OrdersError?] = [:]
    private(set) var cancellingOrderID: String?
    /// Why a cancellation was refused, rendered next to the order.
    private(set) var cancelFailure: CancelFailure?
    private var inFlight: Task<OrderPage, Error>?

    init(service: AuthService, auth: AuthStore) {
        self.service = service
        self.auth = auth
        auth.onSessionEnded { [weak self] in self?.clearCustomerData() }
    }

    var isEmpty: Bool { orders.isEmpty }
    var isLoading: Bool { phase == .loading }
    var isLoadingMore: Bool { phase == .loadingMore }
    var hasMore: Bool { nextCursor != nil }

    func isDetailLoading(_ id: String) -> Bool { detailPhases[id] == nil && details[id] == nil }

    // MARK: - List

    /// Loads the first page, replacing anything already held.
    ///
    /// - Returns: whether the list is now usable, i.e. no blocking failure.
    @discardableResult
    func load() async -> Bool {
        if let inFlight {
            do {
                return apply(try await inFlight.value, replacing: true)
            } catch {
                return fail(map(error))
            }
        }
        let task = Task<OrderPage, Error> { try await service.customerOrders() }
        inFlight = task
        phase = orders.isEmpty ? .loading : phase
        lastError = nil
        do {
            return apply(try await task.value, replacing: true)
        } catch is CancellationError {
            return false
        } catch {
            return fail(map(error))
        }
    }

    /// Appends the next page. A no-op when the API already said there is none.
    @discardableResult
    func loadMore() async -> Bool {
        guard let cursor = nextCursor else { return !orders.isEmpty }
        phase = .loadingMore
        do {
            let page = try await service.customerOrders(cursor: cursor)
            return apply(page, replacing: false)
        } catch is CancellationError {
            phase = .loaded
            return false
        } catch {
            return fail(map(error))
        }
    }

    /// Pull-to-refresh, also used after returning to the screen so an order that
    /// moved on in Admin shows its new state.
    @discardableResult
    func refresh() async -> Bool {
        await load()
    }

    func clearError() {
        lastError = nil
        if case .failed = phase { phase = orders.isEmpty ? .idle : .loaded }
    }

    private func apply(_ page: OrderPage, replacing: Bool) -> Bool {
        orders = replacing ? page.items : orders + page.items.filter { next in
            !orders.contains { $0.id == next.id }
        }
        nextCursor = page.nextCursor
        phase = .loaded
        lastError = nil
        inFlight = nil
        return true
    }

    private func fail(_ error: OrdersError) -> Bool {
        lastError = error
        phase = .failed(error)
        inFlight = nil
        if error.terminatesSession {
            auth.markSessionExpired()
        }
        return false
    }

    // MARK: - Details

    /// Loads one order, addressed by its internal id or its `LBN-…` number.
    ///
    /// A cached copy is reused so returning to a screen is instant, but
    /// `forceRefresh` re-reads the server, which is what surfaces a status change
    /// made in Admin.
    @discardableResult
    func loadDetail(id: String, forceRefresh: Bool = false) async -> PlacedOrder? {
        if !forceRefresh, let cached = details[id] { return cached }
        detailPhases[id] = nil
        do {
            let order = try await service.customerOrder(id: id)
            details[id] = order
            detailPhases[id] = nil
            // Keep the list in step so a status change is visible there too.
            if let index = orders.firstIndex(where: { $0.id == order.id || $0.orderNumber == id }) {
                orders[index] = order
            }
            return order
        } catch is CancellationError {
            return nil
        } catch {
            detailPhases[id] = map(error)
            if map(error).terminatesSession { auth.markSessionExpired() }
            return nil
        }
    }

    func clearDetailError(id: String) {
        detailPhases[id] = nil
    }

    // MARK: - Cancellation

    func isCancelling(_ id: String) -> Bool { cancellingOrderID == id }

    func clearCancelFailure() {
        cancelFailure = nil
    }

    /// Cancels one of the customer's orders through the API.
    ///
    /// Eligibility is the server's call: the button is only offered for a
    /// `pending` order, and a `409 ORDER_NOT_CANCELLABLE` here means the order
    /// moved on between the fetch and the tap, which is reported and then
    /// refreshed rather than papered over. Releasing the reserved stock is the
    /// backend's responsibility; the app only re-reads the result.
    @discardableResult
    func cancel(id: String) async -> PlacedOrder? {
        guard cancellingOrderID == nil else { return details[id] }
        cancelFailure = nil
        cancellingOrderID = id
        defer { cancellingOrderID = nil }
        do {
            let cancelled = try await service.cancelCustomerOrder(id: id)
            details[id] = cancelled
            detailPhases[id] = nil
            if let index = orders.firstIndex(where: { $0.id == cancelled.id }) {
                orders[index] = cancelled
            }
            // Re-read so the screen shows the server's own record, including the
            // cancellation it appended to the status history.
            await loadDetail(id: id, forceRefresh: true)
            return details[id]
        } catch is CancellationError {
            return nil
        } catch let error as AuthError {
            cancelFailure = mapCancelError(error)
            if cancelFailure?.terminatesSession == true { auth.markSessionExpired() }
            // The refusal means local state is stale, so pull the truth.
            if cancelFailure == .notCancellable {
                await loadDetail(id: id, forceRefresh: true)
            }
            return nil
        } catch {
            cancelFailure = .server
            return nil
        }
    }

    private func mapCancelError(_ error: AuthError) -> CancelFailure {
        switch error {
        case .checkout(.orderNotCancellable):
            return .notCancellable
        case .checkout:
            return .server
        case .unauthorized, .expiredSession:
            return .unauthorized
        case .network(let code):
            return OrdersError.fromNetwork(code) == .offline ? .offline : .server
        case .invalidBaseURL:
            return .server
        case .httpStatus(let status, _) where status == 404:
            return .notFound
        default:
            return .server
        }
    }

    /// Drops cached state when the session ends, so a later sign-in never shows
    /// the previous customer's orders.
    /// Drops the previous customer's orders when a session ends, keeping any
    /// error that explains why the shopper is back at the sign-in form.
    func clearCustomerData() {
        inFlight?.cancel()
        inFlight = nil
        orders = []
        details = [:]
        detailPhases = [:]
        nextCursor = nil
        // A failed phase is what shows why the session ended, so it survives.
        if case .failed = phase {} else { phase = .idle }
    }

    func reset() {
        clearCustomerData()
        lastError = nil
        cancelFailure = nil
        cancellingOrderID = nil
        inFlight?.cancel()
        inFlight = nil
        orders = []
        details = [:]
        detailPhases = [:]
        nextCursor = nil
        phase = .idle
        lastError = nil
    }

    private func map(_ error: Error) -> OrdersError {
        guard let authError = error as? AuthError else { return .server }
        switch authError {
        case .unauthorized, .expiredSession:
            return .unauthorized
        case .network(let code):
            return OrdersError.fromNetwork(code)
        case .invalidBaseURL:
            return .configuration
        case .httpStatus(let status, _) where status == 404:
            return .notFound
        case .invalidResponse, .invalidData:
            return .invalidResponse
        default:
            return .server
        }
    }
}

/// Why a customer cancellation did not happen.
enum CancelFailure: Equatable {
    /// The API says the order has already moved past `pending`.
    case notCancellable
    case notFound
    case unauthorized
    case offline
    case server

    var messageKey: String {
        switch self {
        case .notCancellable: "orders.cancel.notCancellable"
        case .notFound: "orders.error.notFound"
        case .unauthorized: "auth.error.unauthorized"
        case .offline: "data.error.offline"
        case .server: "orders.cancel.failed"
        }
    }

    var terminatesSession: Bool { self == .unauthorized }
}

/// Why order history could not be read.
enum OrdersError: Equatable {
    case unauthorized
    case notFound
    case offline
    case server
    case invalidResponse
    case configuration

    var messageKey: String {
        switch self {
        case .unauthorized: "auth.error.unauthorized"
        case .notFound: "orders.error.notFound"
        case .offline: "data.error.offline"
        case .server: "orders.error.server"
        case .invalidResponse: "data.error.invalid"
        case .configuration: "data.error.configuration"
        }
    }

    /// Whether the session is definitively over, rather than a transport problem.
    var terminatesSession: Bool { self == .unauthorized }

    static func fromNetwork(_ code: URLError.Code) -> OrdersError {
        switch code {
        case .notConnectedToInternet, .networkConnectionLost, .cannotFindHost, .cannotConnectToHost:
            .offline
        default:
            .server
        }
    }
}
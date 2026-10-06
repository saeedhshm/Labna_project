import Foundation
import Testing
@testable import Labna

/// Order history and tracking behaviour, driven through a recording backend so
/// the request shape, the store's reactions and the status mapping are all
/// checked without inventing an order system.
@MainActor
@Suite(.serialized)
struct OrdersStoreTests {
    private let container = PersistenceContainer.make(inMemory: true)
    private let baseURL = URL(string: "http://127.0.0.1:3001/api/v1")!

    // MARK: - Recording backend

    private final class Backend: URLProtocol, @unchecked Sendable {
        struct Stub {
            var listStatus = 200
            var listBody: Data?
            var detailStatus = 200
            var detailBody: Data?
            var requestPaths: [String] = []
            var listCalls = 0
        }

        private static let lock = NSLock()
        nonisolated(unsafe) private static var stub = Stub()

        static func set(_ value: Stub) {
            lock.withLock { stub = value }
        }

        static var current: Stub { lock.withLock { stub } }

        static func session() -> URLSession {
            let configuration = URLSessionConfiguration.ephemeral
            configuration.protocolClasses = [Backend.self]
            return URLSession(configuration: configuration)
        }

        override class func canInit(with request: URLRequest) -> Bool { true }
        override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
        override func stopLoading() {}

        override func startLoading() {
            guard let url = request.url else {
                client?.urlProtocol(self, didFailWithError: URLError(.badURL))
                return
            }
            if url.path.contains("/customer/auth/refresh") {
                respond(Fixtures.error(code: "UNAUTHORIZED", status: 401), status: 401, to: url)
                return
            }
            if url.path.hasSuffix("/customer/me") {
                respond(Fixtures.me, status: 200, to: url)
                return
            }
            Self.lock.lock()
            var stub = Self.stub
            stub.requestPaths.append(url.path)
            // Only a path with a trailing identifier is a detail call.
            let isDetail = url.path.hasSuffix("/customer/orders") == false
            if !isDetail { stub.listCalls += 1 }
            Self.stub = stub
            Self.lock.unlock()

            let body = isDetail ? stub.detailBody : stub.listBody
            let status = isDetail ? stub.detailStatus : stub.listStatus
            guard let body else {
                client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
                return
            }
            respond(body, status: status, to: url)
        }

        private func respond(_ body: Data, status: Int, to url: URL) {
            guard let response = HTTPURLResponse(
                url: url,
                statusCode: status,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            ) else {
                client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
                return
            }
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: body)
            client?.urlProtocolDidFinishLoading(self)
        }
    }

    // MARK: - Fixtures

    private enum Fixtures {
        static func envelope(_ data: String) -> Data {
            Data(#"{"data":\#(data),"meta":{"requestID":"r"}}"#.utf8)
        }

        static func listPage(_ orders: [String], nextCursor: String? = nil) -> Data {
            let meta = nextCursor.map { #""nextCursor":"\#($0)""# } ?? #""nextCursor":null"#
            return Data(#"{"data":[\#(orders.joined(separator: ","))],"meta":{\#(meta),"requestID":"r"}}"#.utf8)
        }

        /// One order, matching the `orderDTO` shape the API returns.
        static func order(
            id: String = "order-1",
            number: String = "LBN-20260101-123456",
            status: String = "pending",
            history: [String] = [#"{"status":"pending","at":"2026-01-01T10:00:00.000Z","actorID":null}"#],
            subtotalMinor: Int = 3_600,
            deliveryFeeMinor: Int = 1_500,
            discountMinor: Int = 0,
            couponCode: String = "",
            payment: String = #"{"method":"cash_on_delivery","status":"pending","providerReference":null}"#
        ) -> String {
            #"{"id":"\#(id)","orderNumber":"\#(number)","customerID":"cust-1","customer":{"name":"Tester","phoneNumber":"+201012345678","email":"tester@example.com"},"address":{"city":"Cairo","area":"Maadi","street":"Road 9","building":"12","floor":"3","apartment":"5","notes":"Ring twice"},"branchID":"demo-cairo","items":[{"productID":"milk-full","variantID":"milk-full-250","productName":{"ar":"لبن","en":"Full Cream Milk"},"variantLabel":{"ar":"250 مل","en":"250 ml"},"imageURL":"https://example.test/m.png","quantity":2,"unitPriceMinor":1800,"lineTotalMinor":3600}],"currencyCode":"EGP","subtotalMinor":\#(subtotalMinor),"deliveryFeeMinor":\#(deliveryFeeMinor),"discountMinor":\#(discountMinor),"totalMinor":\#(max(0, subtotalMinor + deliveryFeeMinor - discountMinor)),"couponCode":"\#(couponCode)","payment":\#(payment),"status":"\#(status)","statusHistory":[\#(history.joined(separator: ","))],"createdAt":"2026-01-01T10:00:00.000Z","updatedAt":"2026-01-01T10:00:00.000Z"}"#
        }

        static func detail(_ order: String) -> Data { envelope(order) }

        /// The signed-in customer returned by `/customer/me`.
        static let me = Data("""
        {"data":{"id":"cust-1","name":"Tester","phoneNumber":"+201012345678","email":"tester@example.com","addresses":[],"createdAt":"2026-01-01T00:00:00.000Z"},"meta":{"requestID":"r"}}
        """.utf8)

        static func error(code: String, status: Int) -> Data {
            Data(#"{"error":{"code":"\#(code)","message":"m"},"meta":{"requestID":"r"}}"#.utf8)
        }
    }

    private func makeStore() async -> (orders: OrdersStore, auth: AuthStore) {
        let storage = MemorySessionStore(AuthSession(
            accessToken: "token",
            accessTokenExpiresAt: Date().addingTimeInterval(900),
            refreshCookie: "cookie",
            customer: Customer(
                id: "cust-1",
                name: "Tester",
                phoneNumber: "+201012345678",
                email: "tester@example.com",
                addresses: [],
                createdAt: "2026-01-01T00:00:00.000Z"
            )
        ))
        let service = AuthService(baseURL: baseURL, session: Backend.session(), storage: storage)
        let auth = AuthStore(service: service)
        // Order history is only reachable with a session, so restore it first.
        await auth.restore()
        let orders = OrdersStore(service: service, auth: auth)
        return (orders, auth)
    }

    private func stubList(_ body: Data?, nextCursor: String? = nil, status: Int = 200) {
        Backend.set(.init(listStatus: status, listBody: body, detailBody: nil))
    }

    private func stubBoth(list: Data?, detail: Data? = nil, listStatus: Int = 200, detailStatus: Int = 200) {
        Backend.set(.init(listStatus: listStatus, listBody: list, detailStatus: detailStatus, detailBody: detail))
    }

    // MARK: - List

    @Test func theListLoadsFromTheCustomersOwnOrdersEndpoint() async throws {
        stubBoth(list: Fixtures.listPage([Fixtures.order()]))
        let (orders, _) = await makeStore()

        #expect(await orders.load())
        #expect(orders.phase == .loaded)
        #expect(orders.orders.count == 1)
        // The app never sends an ownership identifier; the token decides.
        #expect(Backend.current.requestPaths == ["/api/v1/customer/orders"])
    }

    @Test func anEmptyHistoryShowsTheEmptyState() async throws {
        stubBoth(list: Fixtures.listPage([]))
        let (orders, _) = await makeStore()

        #expect(await orders.load())
        #expect(orders.isEmpty)
        #expect(orders.phase == .loaded)
        #expect(orders.hasMore == false)
    }

    @Test func pagingFollowsTheServersCursor() async throws {
        stubBoth(list: Fixtures.listPage([Fixtures.order(id: "order-1")], nextCursor: "cursor-2"))
        let (orders, _) = await makeStore()

        #expect(await orders.load())
        #expect(orders.hasMore)
        #expect(orders.orders.count == 1)

        // The next page replaces nothing and appends.
        stubBoth(list: Fixtures.listPage([Fixtures.order(id: "order-2", number: "LBN-20260101-654321")]))
        #expect(await orders.loadMore())
        #expect(orders.orders.count == 2)
        #expect(orders.orders.map(\.id) == ["order-1", "order-2"])
    }

    @Test func loadingMoreStopsWhenTheServerSaysThereIsNoMore() async throws {
        stubBoth(list: Fixtures.listPage([Fixtures.order()]))
        let (orders, _) = await makeStore()
        await orders.load()
        #expect(orders.hasMore == false)

        let before = Backend.current.listCalls
        #expect(await orders.loadMore())
        // No request is made when there is no cursor to follow.
        #expect(Backend.current.listCalls == before)
    }

    @Test func refreshingReplacesTheListSoAdminChangesAppear() async throws {
        stubBoth(list: Fixtures.listPage([Fixtures.order(status: "pending")]))
        let (orders, _) = await makeStore()
        await orders.load()
        #expect(orders.orders.first?.status == .pending)

        // The store moves the order on, as Admin would.
        stubBoth(list: Fixtures.listPage([Fixtures.order(status: "confirmed")]))
        #expect(await orders.refresh())
        #expect(orders.orders.first?.status == .confirmed)
        #expect(orders.orders.count == 1, "A refresh replaces rather than appends")
    }

    // MARK: - Details

    @Test func detailsCarryOrderNumberTotalsAddressAndPayment() async throws {
        let body = Fixtures.detail(Fixtures.order(discountMinor: 360, couponCode: "LABNA10"))
        stubBoth(list: Fixtures.listPage([]), detail: body)
        let (orders, _) = await makeStore()

        let order = try #require(await orders.loadDetail(id: "order-1"))

        #expect(order.orderNumber == "LBN-20260101-123456")
        #expect(order.subtotalMinor == 3_600)
        #expect(order.deliveryFeeMinor == 1_500)
        #expect(order.discountMinor == 360)
        #expect(order.totalMinor == 4_740)
        #expect(order.couponApplied)
        #expect(order.payment.method == .cashOnDelivery)
        #expect(order.payment.status == .pending)
        // The address is the snapshot taken at checkout.
        #expect(order.address.street == "Road 9")
        #expect(order.address.notes == "Ring twice")
        // Item snapshots survive a later catalog change.
        #expect(order.items.first?.productName.value(for: .english) == "Full Cream Milk")
        #expect(order.items.first?.lineTotalMinor == 3_600)
    }

    @Test func detailsCanBeReadByOrderNumberAsWellAsId() async throws {
        stubBoth(list: Fixtures.listPage([]), detail: Fixtures.detail(Fixtures.order()))
        let (orders, _) = await makeStore()

        #expect(await orders.loadDetail(id: "LBN-20260101-123456") != nil)
        #expect(Backend.current.requestPaths.last == "/api/v1/customer/orders/LBN-20260101-123456")
    }

    @Test func aDetailLoadKeepsTheListInStep() async throws {
        stubBoth(
            list: Fixtures.listPage([Fixtures.order(status: "pending")]),
            detail: Fixtures.detail(Fixtures.order(status: "ready"))
        )
        let (orders, _) = await makeStore()
        await orders.load()

        #expect(await orders.loadDetail(id: "order-1", forceRefresh: true) != nil)
        #expect(orders.orders.first?.status == .ready, "A status change must show in the list too")
    }

    @Test func aCachedDetailIsReusedUnlessARefreshIsAsked() async throws {
        stubBoth(list: Fixtures.listPage([]), detail: Fixtures.detail(Fixtures.order(status: "pending")))
        let (orders, _) = await makeStore()
        await orders.loadDetail(id: "order-1")
        let afterFirst = Backend.current.requestPaths.count

        #expect(await orders.loadDetail(id: "order-1") != nil)
        #expect(Backend.current.requestPaths.count == afterFirst, "A cached detail is not refetched")

        #expect(await orders.loadDetail(id: "order-1", forceRefresh: true) != nil)
        #expect(Backend.current.requestPaths.count == afterFirst + 1)
    }

    // MARK: - Status mapping and timeline

    @Test func everyBackendStatusMapsToAMessageAndSymbol() {
        let expected: [OrderStatus: String] = [
            .pending: "checkout.status.pending",
            .confirmed: "checkout.status.confirmed",
            .preparing: "checkout.status.preparing",
            .ready: "checkout.status.ready",
            .outForDelivery: "checkout.status.outForDelivery",
            .completed: "checkout.status.completed",
            .cancelled: "checkout.status.cancelled"
        ]
        for status in OrderStatus.allReportedCases {
            #expect(status.messageKey == expected[status])
            #expect(!status.symbolName.isEmpty)
        }
        // The lifecycle is exactly the API's forward path.
        #expect(OrderStatus.lifecycle == [.pending, .confirmed, .preparing, .ready, .outForDelivery, .completed])
        #expect(OrderStatus.progressIndex(of: .outForDelivery) == 4)
        #expect(OrderStatus.progressIndex(of: .cancelled) == nil)
        #expect(OrderStatus.cancelled.isCancelled)
        #expect(OrderStatus.completed.isTerminal)
        #expect(OrderStatus.ready.isActive)
    }

    @Test func theTimelineUsesTheServersOwnTimestamps() async throws {
        let history = [
            #"{"status":"pending","at":"2026-01-01T10:00:00.000Z","actorID":null}"#,
            #"{"status":"confirmed","at":"2026-01-01T11:30:00.000Z","actorID":"staff-7"}"#,
            #"{"status":"preparing","at":"2026-01-01T12:15:30.500Z","actorID":null}"#
        ]
        stubBoth(list: Fixtures.listPage([]), detail: Fixtures.detail(Fixtures.order(status: "preparing", history: history)))
        let (orders, _) = await makeStore()

        let order = try #require(await orders.loadDetail(id: "order-1"))
        let timeline = order.timeline

        #expect(timeline.count == 3)
        #expect(timeline.map(\.status) == [.pending, .confirmed, .preparing])
        // Timestamps are the server's, to the millisecond.
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        #expect(timeline[1].at == formatter.date(from: "2026-01-01T11:30:00.000Z"))
        #expect(timeline[2].at == formatter.date(from: "2026-01-01T12:15:30.500Z"))
        // A staff driven step is distinguishable from a system one.
        #expect(timeline[0].isSystemChange)
        #expect(timeline[1].isSystemChange == false)
        #expect(order.createdAt == formatter.date(from: "2026-01-01T10:00:00.000Z"))
    }

    @Test func aCancelledOrderKeepsItsHistoryAndLeavesTheHappyPath() async throws {
        let history = [
            #"{"status":"pending","at":"2026-01-01T10:00:00.000Z","actorID":null}"#,
            #"{"status":"cancelled","at":"2026-01-01T10:45:00.000Z","actorID":"staff-7"}"#
        ]
        stubBoth(list: Fixtures.listPage([]), detail: Fixtures.detail(Fixtures.order(status: "cancelled", history: history)))
        let (orders, _) = await makeStore()

        let order = try #require(await orders.loadDetail(id: "order-1"))
        #expect(order.status.isCancelled)
        #expect(order.status.progressIndex == nil)
        #expect(order.status.isTerminal)
        #expect(order.timeline.map(\.status) == [.pending, .cancelled])
    }

    @Test func aPaidOrderReportsThePaymentStatus() async throws {
        let payment = #"{"method":"demo_card_success","status":"paid","providerReference":"demo_1"}"#
        stubBoth(list: Fixtures.listPage([]), detail: Fixtures.detail(Fixtures.order(payment: payment)))
        let (orders, _) = await makeStore()

        let order = try #require(await orders.loadDetail(id: "order-1"))
        #expect(order.payment.status == .paid)
        #expect(order.payment.providerReference == "demo_1")
    }

    // MARK: - Unauthorized and API failures

    @Test func anUnauthorizedSessionEndsTheLocalSession() async throws {
        stubBoth(
            list: Fixtures.error(code: "UNAUTHORIZED", status: 401),
            listStatus: 401
        )
        let (orders, auth) = await makeStore()
        #expect(auth.isAuthenticated)

        #expect(await orders.load() == false)
        #expect(orders.phase == .failed(.unauthorized))
        #expect(orders.lastError == .unauthorized)
        #expect(!auth.isAuthenticated, "A rejected session must return the app to the guest form")
        #expect(orders.orders.isEmpty)
    }

    @Test func aMissingOrderIsReportedDistinctlyFromAServerFailure() async throws {
        stubBoth(list: Fixtures.listPage([]), detail: Fixtures.error(code: "NOT_FOUND", status: 404), detailStatus: 404)
        let (orders, _) = await makeStore()

        #expect(await orders.loadDetail(id: "nope") == nil)
        #expect(orders.detailPhases["nope"] == .notFound)
    }

    @Test func aServerFailureIsReportedAndKeepsNothingOnScreen() async throws {
        stubBoth(list: Fixtures.error(code: "INTERNAL", status: 500), listStatus: 500)
        let (orders, _) = await makeStore()

        #expect(await orders.load() == false)
        #expect(orders.lastError == .server)
        #expect(orders.orders.isEmpty)
        #expect(orders.phase == .failed(.server))
    }

    @Test func aTransportFailureIsReportedAsOffline() async throws {
        // Answers `/customer/me` so the session restores, then fails every other
        // call the way a device with no connectivity would.
        let offline = OfflineAfterSignIn()
        let service = AuthService(
            baseURL: baseURL,
            session: offline.session,
            storage: MemorySessionStore(AuthSession(
                accessToken: "token",
                accessTokenExpiresAt: Date().addingTimeInterval(900),
                refreshCookie: "cookie",
                customer: Customer(
                    id: "cust-1",
                    name: "Tester",
                    phoneNumber: "+201012345678",
                    email: "tester@example.com",
                    addresses: [],
                    createdAt: "2026-01-01T00:00:00.000Z"
                )
            ))
        )
        let auth = AuthStore(service: service)
        await auth.restore()
        #expect(auth.isAuthenticated, "The session was restored before the network went away")

        let orders = OrdersStore(service: service, auth: auth)
        #expect(await orders.load() == false)
        #expect(orders.lastError == .offline)
        #expect(orders.phase == .failed(.offline))
        #expect(orders.orders.isEmpty)
        // A transport problem must not end a session the server still accepts.
        #expect(auth.isAuthenticated)
    }

    @Test func aClearedErrorReturnsTheListToAUsableState() async throws {
        stubBoth(list: Fixtures.error(code: "INTERNAL", status: 500), listStatus: 500)
        let (orders, _) = await makeStore()
        await orders.load()
        #expect(orders.phase == .failed(.server))

        orders.clearError()
        #expect(orders.lastError == nil)
        #expect(orders.phase == .idle)
    }

    @Test func resettingDropsTheOtherCustomersOrders() async throws {
        stubBoth(list: Fixtures.listPage([Fixtures.order()]))
        let (orders, _) = await makeStore()
        await orders.load()
        await orders.loadDetail(id: "order-1")
        #expect(orders.orders.count == 1)

        // Sign-out must not leave the previous customer's history behind.
        orders.reset()
        #expect(orders.orders.isEmpty)
        #expect(orders.details.isEmpty)
        #expect(orders.phase == .idle)
        #expect(orders.hasMore == false)
    }
}

extension OrderStatus {
    /// Every case the API can report, so the mapping test cannot miss one.
    static let allReportedCases: [OrderStatus] = [
        .pending, .confirmed, .preparing, .ready, .outForDelivery, .completed, .cancelled
    ]

    static func progressIndex(of status: OrderStatus) -> Int? { status.progressIndex }
}

/// Answers the session call and then fails everything else, which is how "signed
/// in but the store is unreachable" presents.
private final class OfflineAfterSignIn: URLProtocol, @unchecked Sendable {
    let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [OfflineAfterSignIn.self]
        return URLSession(configuration: configuration)
    }()

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        guard let url = request.url, url.path.hasSuffix("/customer/me"),
              let response = HTTPURLResponse(
                url: url,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
              ) else {
            client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
            return
        }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Self.signedInCustomer)
        client?.urlProtocolDidFinishLoading(self)
    }

    private static let signedInCustomer = Data(
        #"{"data":{"id":"cust-1","name":"Tester","phoneNumber":"+201012345678","email":"tester@example.com","addresses":[],"createdAt":"2026-01-01T00:00:00.000Z"},"meta":{"requestID":"r"}}"#.utf8
    )
}

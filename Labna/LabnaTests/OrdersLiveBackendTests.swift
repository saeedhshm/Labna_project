import Foundation
import Testing
@testable import Labna

/// Exercises order history against the API on `127.0.0.1:3001`, including the
/// round trip the brief calls for: place an order, move it through Admin, and see
/// the new status and timeline on the device after a refresh.
///
/// Admin changes are made through the API's own admin routes, so the transition
/// history the app then reads is genuinely the server's. Every order this suite
/// creates is cancelled afterwards, releasing the stock it reserved.
@MainActor
@Suite(.serialized)
struct OrdersLiveBackendTests {
    private static let baseURL = URL(string: "http://127.0.0.1:3001/api/v1")!
    private let container = PersistenceContainer.make(inMemory: true)

    /// Orders created by this run, cancelled so repeated runs leave no stock
    /// drift behind.
    private final class Cleanup {
        private let lock = NSLock()
        private var orderIDs: [String] = []
        private let environmentFile: URL

        init(environmentFile: URL) {
            self.environmentFile = environmentFile
        }

        func track(_ id: String) {
            lock.lock(); defer { lock.unlock() }
            orderIDs.append(id)
        }

        func releaseNow() {
            let ids = lock.withLock { orderIDs }
            guard !ids.isEmpty else { return }
            let semaphore = DispatchSemaphore(value: 0)
            Task {
                guard let admin = await AdminOrders.make(environmentFile: environmentFile) else {
                    semaphore.signal()
                    return
                }
                for id in ids { _ = try? await admin.cancel(orderID: id) }
                semaphore.signal()
            }
            _ = semaphore.wait(timeout: .now() + 30)
        }
    }

    /// Reads the API's local development credentials so reservations can be
    /// released again. Nothing sensitive is ever committed.
    private struct AdminOrders {
        let baseURL: URL
        let token: String

        private static let session: URLSession = {
            let configuration = URLSessionConfiguration.ephemeral
            configuration.httpCookieStorage = nil
            configuration.httpShouldSetCookies = false
            configuration.httpCookieAcceptPolicy = .never
            configuration.timeoutIntervalForRequest = 20
            return URLSession(configuration: configuration)
        }()

        static func make(environmentFile: URL) async -> AdminOrders? {
            guard let text = try? String(contentsOf: environmentFile, encoding: .utf8) else { return nil }
            func value(_ key: String) -> String? {
                for line in text.split(separator: "\n") {
                    let parts = line.split(separator: "=", maxSplits: 1).map(String.init)
                    guard parts.count == 2, parts[0].trimmingCharacters(in: .whitespaces) == key else { continue }
                    return parts[1].trimmingCharacters(in: .whitespaces)
                }
                return nil
            }
            guard let email = value("SEED_ADMIN_EMAIL"),
                  let password = value("SEED_ADMIN_PASSWORD"),
                  let base = URL(string: "http://127.0.0.1:3001/api/v1") else { return nil }

            var request = URLRequest(url: base.appendingPathComponent("staff/auth/login"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try? JSONEncoder().encode(["email": email, "password": password])
            guard let (data, response) = try? await Self.session.data(for: request),
                  let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let payload = json["data"] as? [String: Any],
                  let token = payload["accessToken"] as? String else { return nil }
            return AdminOrders(baseURL: base.appendingPathComponent("admin"), token: token)
        }

        /// Moves an order on, the way an operator would from Admin.
        func setStatus(orderID: String, status: String) async -> Bool {
            var request = URLRequest(url: baseURL.appendingPathComponent("orders/\(orderID)/status"))
            request.httpMethod = "PATCH"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try? JSONSerialization.data(withJSONObject: ["status": status])
            guard let (_, response) = try? await Self.session.data(for: request),
                  let http = response as? HTTPURLResponse else { return false }
            return (200..<300).contains(http.statusCode)
        }

        func reservedUnits(branchID: String, variantID: String) async -> Int? {
            var components = URLComponents(
                url: baseURL.appendingPathComponent("inventory"),
                resolvingAgainstBaseURL: false
            )
            components?.queryItems = [
                URLQueryItem(name: "branchID", value: branchID),
                URLQueryItem(name: "variantID", value: variantID),
                URLQueryItem(name: "lowStock", value: "false"),
                URLQueryItem(name: "outOfStock", value: "false")
            ]
            guard let url = components?.url else { return nil }
            var request = URLRequest(url: url)
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            guard let (data, response) = try? await Self.session.data(for: request),
                  let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let rows = json["data"] as? [[String: Any]] else { return nil }
            return rows.first?["reserved"] as? Int
        }

        func cancel(orderID: String) async throws {
            var request = URLRequest(url: baseURL.appendingPathComponent("orders/\(orderID)/status"))
            request.httpMethod = "PATCH"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = Data(#"{"status":"cancelled"}"#.utf8)
            _ = try await Self.session.data(for: request)
        }
    }

    private var apiEnvironment: URL {
        var root = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 {
            root = root.deletingLastPathComponent()
            let candidate = root.appendingPathComponent("labna_web/apps/api/.env")
            if FileManager.default.fileExists(atPath: candidate.path) { return candidate.standardizedFileURL }
        }
        return root.appendingPathComponent("labna_web/apps/api/.env").standardizedFileURL
    }

    private func backendIsReachable() async -> Bool {
        var request = URLRequest(url: Self.baseURL.appendingPathComponent("products"))
        request.timeoutInterval = 3
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        guard let (_, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse else { return false }
        return (200..<300).contains(http.statusCode)
    }

    private func skipIfRateLimited(_ body: () async throws -> Void) async throws {
        do {
            try await body()
        } catch let error as AuthError {
            if case .httpStatus(let status, _) = error, status == 429 { return }
            throw error
        }
    }

    // MARK: - Fixture

    /// A signed-in customer, a saved address and one product in the cart, wired
    /// to the real checkout so the order under test is created by the API.
    private func scenario(quantity: Int = 2) async throws -> (
        checkout: CheckoutStore,
        cart: CartStore,
        auth: AuthStore,
        service: AuthService,
        orders: OrdersStore,
        address: CustomerAddress
    ) {
        let email = "ios-hist-\(UUID().uuidString.prefix(8))@example.com".lowercased()
        let storage = LiveAccountSessionStore()
        let service = AuthService(baseURL: Self.baseURL, session: AuthService.defaultSession(), storage: storage)
        let registered = try await service.register(
            name: "History Tester",
            phoneNumber: "+2010\(Int.random(in: 10_000_000...99_999_999))",
            email: email,
            password: "password123"
        )
        let address = try await service.createAddress(.init(
            label: "Home",
            city: "Cairo",
            area: "Maadi",
            street: "Road 9",
            building: "12",
            floor: "3",
            apartment: "5",
            notes: "",
            recipientName: "History Tester",
            phoneNumber: registered.phoneNumber,
            isDefault: true
        ))
        let session = try #require(storage.snapshot)
        try storage.save(AuthSession(
            accessToken: session.accessToken,
            accessTokenExpiresAt: session.accessTokenExpiresAt,
            refreshCookie: session.refreshCookie,
            customer: Customer(
                id: session.customer.id,
                name: session.customer.name,
                phoneNumber: session.customer.phoneNumber,
                email: session.customer.email,
                addresses: [address],
                createdAt: session.customer.createdAt
            )
        ))

        let auth = AuthStore(service: service)
        await auth.restore()

        let productsURL = try #require(Bundle.main.url(forResource: "products", withExtension: "json"))
        let all = try JSONDecoder().decode([Product].self, from: Data(contentsOf: productsURL))
        let product = try #require(all.first { $0.id == "milk-full" })
        let variant = try #require(product.variants.first { $0.id == "milk-full-250" })
        let cart = CartStore(modelContainer: container)
        cart.removeAll()
        cart.review(using: [product])
        cart.add(product: product, variant: variant, quantity: quantity)

        let validation = CartValidationStore(service: CartValidationService(baseURL: Self.baseURL), cart: cart)
        let checkout = CheckoutStore(service: service, auth: auth, cart: cart, cartValidation: validation)
        checkout.prepare()
        let orders = OrdersStore(service: service, auth: auth)
        return (checkout, cart, auth, service, orders, address)
    }

    // MARK: - Tests

    @Test func aPlacedOrderAppearsInTheCustomersHistory() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let scenario = try await self.scenario()
            let cleanup = Cleanup(environmentFile: apiEnvironment)
            defer { cleanup.releaseNow() }

            #expect(await scenario.orders.load())
            #expect(scenario.orders.isEmpty, "A new customer has no history yet")

            let placed = try #require(try await scenario.checkout.submit(notes: "Leave at reception"))
            cleanup.track(placed.id)

            #expect(await scenario.orders.refresh())
            #expect(scenario.orders.orders.count == 1)
            let listed = try #require(scenario.orders.orders.first)
            #expect(listed.orderNumber == placed.orderNumber)
            #expect(listed.status == .pending)
            #expect(listed.payment.method == .cashOnDelivery)
            #expect(listed.totalMinor == placed.totalMinor)
            #expect(listed.items.first?.productName.value(for: .english) == placed.items.first?.productName.value(for: .english))
        }
    }

    @Test func anAdminStatusChangeAppearsAfterARefresh() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let scenario = try await self.scenario()
            let cleanup = Cleanup(environmentFile: apiEnvironment)
            defer { cleanup.releaseNow() }
            let admin = try #require(await AdminOrders.make(environmentFile: apiEnvironment))

            let placed = try #require(try await scenario.checkout.submit(notes: ""))
            cleanup.track(placed.id)
            #expect(await scenario.orders.refresh())
            #expect(scenario.orders.orders.first?.status == .pending)
            #expect(scenario.orders.orders.first?.timeline.map(\.status) == [.pending])

            // The store moves the order on, exactly as an Admin operator would.
            #expect(await admin.setStatus(orderID: placed.id, status: "confirmed"))
            #expect(await admin.setStatus(orderID: placed.id, status: "preparing"))

            // The app learns about it by re-reading the server, never locally.
            #expect(await scenario.orders.refresh())
            let refreshed = try #require(scenario.orders.orders.first)
            #expect(refreshed.status == .preparing)
            #expect(refreshed.timeline.map(\.status) == [.pending, .confirmed, .preparing])
            // Timeline timestamps come from the server's history.
            let times = refreshed.timeline.map(\.at)
            #expect(times == times.sorted(), "History must read oldest first")
            #expect(Set(times).count == times.count, "Each step has its own timestamp")
            #expect(refreshed.timeline[0].isSystemChange)
            #expect(refreshed.timeline[1].isSystemChange == false, "Staff driven steps carry an actor")
        }
    }

    @Test func theFullLifecycleIsReachableAndRecorded() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let scenario = try await self.scenario()
            let cleanup = Cleanup(environmentFile: apiEnvironment)
            defer { cleanup.releaseNow() }
            let admin = try #require(await AdminOrders.make(environmentFile: apiEnvironment))

            let placed = try #require(try await scenario.checkout.submit(notes: ""))
            cleanup.track(placed.id)

            // Only forward transitions the API permits.
            for status in ["confirmed", "preparing", "ready", "out_for_delivery", "completed"] {
                #expect(await admin.setStatus(orderID: placed.id, status: status), "could not move to \(status)")
            }

            #expect(await scenario.orders.loadDetail(id: placed.id, forceRefresh: true) != nil)
            let order = try #require(scenario.orders.details[placed.id])
            #expect(order.status == .completed)
            #expect(order.status.isTerminal)
            #expect(order.timeline.map(\.status) == OrderStatus.lifecycle)
        }
    }

    @Test func anOrderCanBeCancelledAndKeepsItsHistory() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let scenario = try await self.scenario()
            let admin = try #require(await AdminOrders.make(environmentFile: apiEnvironment))

            let placed = try #require(try await scenario.checkout.submit(notes: ""))
            #expect(await admin.setStatus(orderID: placed.id, status: "cancelled"))

            #expect(await scenario.orders.refresh())
            let order = try #require(scenario.orders.orders.first)
            #expect(order.status == .cancelled)
            #expect(order.status.isCancelled)
            #expect(order.status.progressIndex == nil, "A cancelled order leaves the happy path")
            #expect(order.timeline.map(\.status) == [.pending, .cancelled])
        }
    }

    @Test func detailsCarryTheAddressAndItemSnapshotsTakenAtCheckout() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let scenario = try await self.scenario()
            let cleanup = Cleanup(environmentFile: apiEnvironment)
            defer { cleanup.releaseNow() }
            scenario.checkout.updateCoupon("LABNA10")

            let placed = try #require(try await scenario.checkout.submit(notes: "Ring twice"))
            cleanup.track(placed.id)

            let detail = try #require(try await scenario.orders.loadDetail(id: placed.id))
            #expect(detail.orderNumber.hasPrefix("LBN-"))
            #expect(detail.address.city == scenario.address.city)
            #expect(detail.address.street == scenario.address.street)
            #expect(detail.address.notes.contains("Ring twice"))
            #expect(detail.customer.phoneNumber == scenario.address.phoneNumber)
            #expect(detail.couponApplied)
            #expect(detail.discountMinor == 360)
            #expect(detail.totalMinor == detail.subtotalMinor + detail.deliveryFeeMinor - detail.discountMinor)
            #expect(detail.items.count == 1)
            #expect(detail.items.first?.quantity == 2)
            #expect(detail.createdAt <= detail.updatedAt)
        }
    }

    @Test func oneCustomerCannotReadAnotherCustomersOrder() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let owner = try await self.scenario()
            let cleanup = Cleanup(environmentFile: apiEnvironment)
            defer { cleanup.releaseNow() }
            let placed = try #require(try await owner.checkout.submit(notes: ""))
            cleanup.track(placed.id)

            // A different session must not see it, by id or by order number.
            let other = try await self.scenario()
            #expect(await other.orders.load())
            #expect(other.orders.isEmpty)

            #expect(await other.orders.loadDetail(id: placed.id) == nil)
            #expect(other.orders.detailPhases[placed.id] == .notFound)
            #expect(await other.orders.loadDetail(id: placed.orderNumber) == nil)
        }
    }

    @Test func ordersWithoutASessionAreRefused() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let service = AuthService(
                baseURL: Self.baseURL,
                session: AuthService.defaultSession(),
                storage: LiveAccountSessionStore()
            )
            let orders = OrdersStore(service: service, auth: AuthStore(service: service))
            #expect(await orders.load() == false)
            #expect(orders.lastError == .unauthorized)
            #expect(orders.orders.isEmpty)
        }
    }

    @Test func anUnknownOrderIsReportedAsMissing() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let scenario = try await self.scenario()
            #expect(await scenario.orders.loadDetail(id: "does-not-exist") == nil)
            #expect(scenario.orders.detailPhases["does-not-exist"] == .notFound)
        }
    }

    @Test func pagingStopsAtTheEndOfTheHistory() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let scenario = try await self.scenario()
            let cleanup = Cleanup(environmentFile: apiEnvironment)
            defer { cleanup.releaseNow() }
            let placed = try #require(try await scenario.checkout.submit(notes: ""))
            cleanup.track(placed.id)

            #expect(await scenario.orders.load())
            #expect(scenario.orders.orders.count == 1)
            // Only one order exists, so the API reports no further page.
            #expect(scenario.orders.hasMore == false)
            #expect(await scenario.orders.loadMore())
            #expect(scenario.orders.orders.count == 1)
        }
    }

    @Test func theStockAnOrderReservedIsGivenBackWhenItIsCancelled() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let scenario = try await self.scenario(quantity: 2)
            let cleanup = Cleanup(environmentFile: apiEnvironment)
            let admin = try #require(await AdminOrders.make(environmentFile: apiEnvironment))
            let before = try #require(await admin.reservedUnits(branchID: "demo-cairo", variantID: "milk-full-250"))

            let placed = try #require(try await scenario.checkout.submit(notes: ""))
            cleanup.track(placed.id)
            let afterOrder = try #require(await admin.reservedUnits(branchID: "demo-cairo", variantID: "milk-full-250"))
            #expect(afterOrder == before + 2)

            cleanup.releaseNow()
            let afterCancel = try #require(await admin.reservedUnits(branchID: "demo-cairo", variantID: "milk-full-250"))
            #expect(afterCancel == before)
        }
    }
}
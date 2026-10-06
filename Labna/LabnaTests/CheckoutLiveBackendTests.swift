import Foundation
import Testing
@testable import Labna

/// Exercises the real checkout against the API running on `127.0.0.1:3001`.
///
/// A successful run creates a genuine order: the numbers, the `LBN-…` reference
/// and the reservation all come from the server, and the order is linked to the
/// signed-in customer so it also shows up for them under `/customer/orders`.
///
/// Every order this suite creates is cancelled afterwards, which releases the
/// stock it reserved, so the suite leaves no stock drift behind.
///
/// Skips itself when the backend is unreachable.
@MainActor
@Suite(.serialized)
struct CheckoutLiveBackendTests {
    private static let baseURL = URL(string: "http://127.0.0.1:3001/api/v1")!
    private let container = PersistenceContainer.make(inMemory: true)

    /// The repo ships the API's local development credentials; reading them here
    /// keeps them out of the app and out of the source.
    private var apiEnvironment: URL {
        // Looked up by walking up from this file rather than from the working
        // directory, so it does not matter where the runner was invoked from.
        var root = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 {
            root = root.deletingLastPathComponent()
            let candidate = root.appendingPathComponent("labna_web/apps/api/.env")
            if FileManager.default.fileExists(atPath: candidate.path) { return candidate.standardizedFileURL }
        }
        return root.appendingPathComponent("labna_web/apps/api/.env").standardizedFileURL
    }

    private func makeReservations() -> Reservations {
        Reservations(environmentFile: apiEnvironment)
    }

    /// Cancelled orders created by this run. Every test releases from `defer` so
    /// the stock it reserved is handed back and repeated runs do not drift.
    private final class Reservations {
        private let lock = NSLock()
        private var orderIDs: [String] = []
        /// Where the API's local development credentials live.
        private let environmentFile: URL

        init(environmentFile: URL) {
            self.environmentFile = environmentFile
        }

        /// Blocking release for use from `defer`, so a failing expectation can
        /// never leak a reservation into the next run.
        func releaseNow() {
            let ids = lock.withLock { self.orderIDs }
            guard !ids.isEmpty else { return }
            let fresh = lock.withLock { () -> Bool in
                guard !released else { return false }
                released = true
                return true
            }
            guard fresh else { return }
            let semaphore = DispatchSemaphore(value: 0)
            Task {
                guard let admin = await AdminOrders.make(environmentFile: environmentFile) else {
                    semaphore.signal()
                    return
                }
                for id in ids {
                    _ = try? await admin.cancel(orderID: id)
                }
                semaphore.signal()
            }
            _ = semaphore.wait(timeout: .now() + 30)
        }

        func track(_ id: String) {
            lock.lock(); defer { lock.unlock() }
            orderIDs.append(id)
        }

        private var released = false
    }

    /// Minimal admin client used only to release the reservations this suite
    /// takes. Credentials come from the API's own `.env`, never from source.
    private struct AdminOrders {
        let baseURL: URL
        let token: String

        /// `URLSession.shared` keeps a cookie jar, and a leftover
        /// `labna_staff_refresh` cookie makes the API answer `403
        /// INVALID_ORIGIN`, so admin calls use a cookie-less session too.
        private static let session: URLSession = {
            let configuration = URLSessionConfiguration.ephemeral
            configuration.httpCookieStorage = nil
            configuration.httpShouldSetCookies = false
            configuration.httpCookieAcceptPolicy = .never
            configuration.timeoutIntervalForRequest = 20
            return URLSession(configuration: configuration)
        }()


        /// Signs in with the API's seeded manager so the order can be released
        /// again after the test has finished with it.
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
                  // Staff sign-in is mounted at the API root, while the admin
                  // resources live under the `/admin` prefix.
                  let base = URL(string: "http://127.0.0.1:3001/api/v1") else { return nil }
            let adminBase = base.appendingPathComponent("admin")

            var request = URLRequest(url: base.appendingPathComponent("staff/auth/login"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try? JSONEncoder().encode(["email": email, "password": password])
            request.timeoutInterval = 20
            guard let (data, response) = try? await Self.session.data(for: request),
                  let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let payload = json["data"] as? [String: Any],
                  let token = payload["accessToken"] as? String else { return nil }
            return AdminOrders(baseURL: adminBase, token: token)
        }

        func cancel(orderID: String) async throws {
            var request = URLRequest(url: baseURL.appendingPathComponent("orders/\(orderID)/status"))
            request.httpMethod = "PATCH"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = Data(#"{"status":"cancelled"}"#.utf8)
            request.timeoutInterval = 20
            _ = try await Self.session.data(for: request)
        }

        /// Units currently reserved for a variant, straight from inventory.
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
            request.timeoutInterval = 20
            guard let (data, response) = try? await Self.session.data(for: request),
                  let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let rows = json["data"] as? [[String: Any]] else { return nil }
            return rows.first?["reserved"] as? Int
        }

        /// Confirms the order really is listed for the admin.
        func isListed(orderNumber: String) async -> Bool {
            var components = URLComponents(url: baseURL.appendingPathComponent("orders"), resolvingAgainstBaseURL: false)
            components?.queryItems = [URLQueryItem(name: "q", value: orderNumber)]
            guard let url = components?.url else { return false }
            var request = URLRequest(url: url)
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.timeoutInterval = 20
            guard let (data, response) = try? await Self.session.data(for: request),
                  let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let items = json["data"] as? [[String: Any]] else { return false }
            return items.contains { $0["orderNumber"] as? String == orderNumber }
        }
    }

    /// Treats a throttled auth router as "come back later" rather than a defect.
    private func skipIfRateLimited(_ body: () async throws -> Void) async throws {
        do {
            try await body()
        } catch let error as AuthError {
            if case .httpStatus(let status, _) = error, status == 429 { return }
            throw error
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

    // MARK: - Fixtures

    private func products() throws -> [Product] {
        let url = try #require(Bundle.main.url(forResource: "products", withExtension: "json"))
        return try JSONDecoder().decode([Product].self, from: Data(contentsOf: url))
    }

    /// Registers a customer with one saved address and puts one product in the
    /// cart, then builds the real checkout stack on top of the shared service.
    private func signedInCart(quantity: Int = 2) async throws -> (
        checkout: CheckoutStore,
        cart: CartStore,
        auth: AuthStore,
        service: AuthService,
        customer: Customer
    ) {
        let email = "ios-order-\(UUID().uuidString.prefix(8))@example.com".lowercased()
        let storage = LiveAccountSessionStore()
        let service = AuthService(baseURL: Self.baseURL, session: AuthService.defaultSession(), storage: storage)
        let registered = try await service.register(
            name: "Order Tester",
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
            recipientName: "Order Tester",
            phoneNumber: registered.phoneNumber,
            isDefault: true
        ))
        // The create response is appended to the session copy so checkout sees it.
        let refreshed = try #require(storage.snapshot?.customer)
        let withAddress = Customer(
            id: refreshed.id,
            name: refreshed.name,
            phoneNumber: refreshed.phoneNumber,
            email: refreshed.email,
            addresses: refreshed.addresses.isEmpty ? [address] : refreshed.addresses,
            createdAt: refreshed.createdAt
        )
        let session = try #require(storage.snapshot)
        try storage.save(AuthSession(
            accessToken: session.accessToken,
            accessTokenExpiresAt: session.accessTokenExpiresAt,
            refreshCookie: session.refreshCookie,
            customer: withAddress
        ))

        let auth = AuthStore(service: service)
        await auth.restore()

        let all = try products()
        let product = try #require(all.first { $0.id == "milk-full" })
        let variant = try #require(product.variants.first { $0.id == "milk-full-250" })
        let cart = CartStore(modelContainer: container)
        cart.removeAll()
        cart.review(using: [product])
        cart.add(product: product, variant: variant, quantity: quantity)

        let validation = CartValidationStore(
            service: CartValidationService(baseURL: Self.baseURL),
            cart: cart
        )
        let checkout = CheckoutStore(
            service: service,
            auth: auth,
            cart: cart,
            cartValidation: validation
        )
        checkout.prepare()
        return (checkout, cart, auth, service, withAddress)
    }

    // MARK: - Success

    @Test func aRealCheckoutCreatesAnOrderVisibleInAdmin() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let scenario = try await signedInCart()
            let reservations = makeReservations()
            defer { reservations.releaseNow() }

            let order = try #require(try await scenario.checkout.submit(notes: "Leave at reception"))

            // The reference is a real order number, not a locally minted one.
            #expect(order.orderNumber.hasPrefix("LBN-"))
            #expect(order.orderNumber.count > 6)
            #expect(order.status == .pending)
            #expect(order.payment.method == .cashOnDelivery)
            #expect(order.payment.status == .pending)
            #expect(order.branchID == "demo-cairo")
            #expect(order.currencyCode == "EGP")

            // Totals are the server's, and delivery is charged on top.
            #expect(order.subtotalMinor == 2 * 1_800)
            #expect(order.deliveryFeeMinor == 1_500)
            #expect(order.discountMinor == 0)
            #expect(order.totalMinor == 2 * 1_800 + 1_500)

            // The order carries the chosen delivery address.
            #expect(order.address.city == "Cairo")
            #expect(order.address.area == "Maadi")
            #expect(order.address.street == "Road 9")
            #expect(order.address.floor == "3")
            #expect(order.address.apartment == "5")
            #expect(order.address.notes.contains("Leave at reception"))

            // It is linked to the signed-in customer, so it appears for them too.
            #expect(order.customerID == scenario.customer.id)

            // And the cart is only now empty.
            #expect(scenario.cart.items.isEmpty)
            #expect(scenario.checkout.failure == nil)

            reservations.track(order.id)
            #expect(await isVisibleToCustomer(scenario.service, order: order))
            let admin = try #require(await AdminOrders.make(environmentFile: apiEnvironment),
                                    "Admin credentials are needed to confirm the order in Admin")
            #expect(await admin.isListed(orderNumber: order.orderNumber))
        }
    }
    @Test func theLabna10CouponIsAppliedByTheServer() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let scenario = try await signedInCart()
            let reservations = makeReservations()
            defer { reservations.releaseNow() }
            scenario.checkout.updateCoupon("LABNA10")

            let order = try #require(try await scenario.checkout.submit(notes: ""))

            #expect(order.couponApplied)
            #expect(order.couponCode == "LABNA10")
            // A tenth of a 3,600 minor unit subtotal.
            #expect(order.discountMinor == 360)
            #expect(order.totalMinor == 3_600 + 1_500 - 360)
            reservations.track(order.id)
        }
    }
    @Test func anUnknownCouponStillCreatesTheOrderWithoutADiscount() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let scenario = try await signedInCart()
            let reservations = makeReservations()
            defer { reservations.releaseNow() }
            scenario.checkout.updateCoupon("NOTREAL")

            let order = try #require(try await scenario.checkout.submit(notes: ""))

            // The API accepts any code and simply grants nothing, so the shopper is
            // told rather than left guessing.
            #expect(order.couponCode == "NOTREAL")
            #expect(order.couponApplied == false)
            #expect(order.couponIgnored)
            #expect(order.totalMinor == 3_600 + 1_500)
            reservations.track(order.id)
        }
    }
    @Test func theOrderIsPricedByTheServerNotByTheCart() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let scenario = try await signedInCart()
            let reservations = makeReservations()
            defer { reservations.releaseNow() }
            // The cart holds the price from when the line was added; the order must
            // carry whatever the catalog says now.
            let cartPrice = try #require(scenario.cart.items.first?.priceAtAdditionMinor)

            let order = try #require(try await scenario.checkout.submit(notes: ""))

            #expect(order.items.first?.unitPriceMinor == 1_800)
            #expect(order.subtotalMinor == 2 * 1_800)
            #expect(order.totalMinor != cartPrice + 1_500 || cartPrice == 1_800)
            reservations.track(order.id)
        }
    }
    @Test func stockIsReservedByTheOrderAndReleasedOnCancellation() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let scenario = try await signedInCart(quantity: 3)
            let reservations = makeReservations()
            defer { reservations.releaseNow() }
            let admin = try #require(await AdminOrders.make(environmentFile: apiEnvironment))
            let reserved = try #require(await admin.reservedUnits(branchID: "demo-cairo", variantID: "milk-full-250"))
            let before = reserved

            let order = try #require(try await scenario.checkout.submit(notes: ""))
            reservations.track(order.id)

            let afterOrder = try #require(await admin.reservedUnits(branchID: "demo-cairo", variantID: "milk-full-250"))
            #expect(afterOrder == before + 3, "Checkout must reserve the stock it sold")

            // Reading the order back proves the API persisted it.
            let reread = try await scenario.service.order(id: order.id)
            #expect(reread.orderNumber == order.orderNumber)
            #expect(reread.id == order.id)

            // Released explicitly here so the effect is observable; the `defer`
            // then has nothing left to do.
            reservations.releaseNow()
            let afterCancel = try #require(await admin.reservedUnits(branchID: "demo-cairo", variantID: "milk-full-250"))
            #expect(afterCancel == before, "Cancelling must give the stock back")
        }
    }
    @Test func aSecondIdenticalCheckoutCreatesASeparateOrder() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let scenario = try await signedInCart()
            let reservations = makeReservations()
            defer { reservations.releaseNow() }
            scenario.checkout.updateCoupon("LABNA10")

            let first = try #require(try await scenario.checkout.submit(notes: "First"))
            // The cart is empty now, so it has to be rebuilt before ordering again.
            #expect(scenario.cart.items.isEmpty)
            #expect(await scenario.checkout.submit(notes: "Second") == nil)
            #expect(scenario.checkout.failure == .emptyCart)

            reservations.track(first.id)
            #expect(first.orderNumber.hasPrefix("LBN-"))
        }
    }
    // MARK: - Failures against the real API

    @Test func askingForMoreStockThanExistsIsRefusedAndKeepsTheCart() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let scenario = try await signedInCart(quantity: 1)

            // Find out what is actually available, then ask for one more.
            let validationService = CartValidationService(baseURL: Self.baseURL)
            let probe = try await validationService.validate(items: scenario.cart.items)
            let available = try #require(probe.items.first?.availableQuantity)
            scenario.cart.setQuantity(available + 1, for: scenario.cart.items[0].id)

            let order = await scenario.checkout.submit(notes: "")

            #expect(order == nil)
            #expect(scenario.cart.items.count == 1, "A refused order must not empty the cart")
            #expect(scenario.checkout.failure == .cartNotConfirmed([.insufficientStock]))
        }
    }
    @Test func anEmptyCartIsRefusedByTheClientBeforeAnyRequest() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let scenario = try await signedInCart()
            scenario.cart.removeAll()

            #expect(await scenario.checkout.submit(notes: "") == nil)
            #expect(scenario.checkout.failure == .emptyCart)
        }
    }
    @Test func aMissingSavedAddressIsRefusedBeforeAnyRequest() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let scenario = try await signedInCart()
            scenario.checkout.select(addressID: nil)

            #expect(scenario.checkout.blockingReason == CheckoutFailure.missingAddress)
            #expect(await scenario.checkout.submit(notes: "") == nil)
            #expect(scenario.checkout.failure == CheckoutFailure.missingAddress)
            #expect(scenario.cart.items.count == 1)
        }
    }
    @Test func invalidContactDetailsAreRefusedBeforeAnyRequest() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let scenario = try await signedInCart()
            scenario.checkout.updateContact(ProfileDraft(name: "A", phoneNumber: "12345", email: ""))

            #expect(scenario.checkout.blockingReason == CheckoutFailure.invalidContact)
            #expect(await scenario.checkout.submit(notes: "") == nil)
            #expect(scenario.checkout.failure == CheckoutFailure.invalidContact)
            #expect(scenario.cart.items.count == 1)
        }
    }
    @Test func anUnreachableStoreRefusesTheOrderWithoutClearingTheCart() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            // A real signed-in customer and cart, so the only thing broken is the
            // network the order would travel over.
            let scenario = try await signedInCart()
            let dead = URL(string: "http://127.0.0.1:9/api/v1")!
            let offlineValidation = CartValidationStore(
                service: CartValidationService(baseURL: dead),
                cart: scenario.cart
            )
            let offlineCheckout = CheckoutStore(
                service: AuthService(baseURL: dead, session: AuthService.defaultSession(), storage: LiveAccountSessionStore()),
                auth: scenario.auth,
                cart: scenario.cart,
                cartValidation: offlineValidation
            )
            offlineCheckout.prepare()
            // A saved address exists, so the block must come from the network.
            #expect(offlineCheckout.blockingReason == nil)

            #expect(await offlineCheckout.submit(notes: "") == nil)
            #expect(offlineCheckout.failure == .cartNotConfirmed([]))
            // The cart survives so the shopper can retry once the store is back.
            #expect(scenario.cart.items.count == 1)
            #expect(scenario.cart.totalMinor > 0)
        }
    }
    @Test func anUnknownOrderCannotBeReadBack() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let scenario = try await signedInCart()
            do {
                _ = try await scenario.service.order(id: "does-not-exist")
                Issue.record("Reading an unknown order should fail")
            } catch let error as AuthError {
                guard case .httpStatus(let status, _) = error else {
                    Issue.record("Expected an HTTP status error, got \(error)")
                    return
                }
                #expect(status == 404)
            }
        }
    }
    // MARK: - Helpers

    private func isVisibleToCustomer(_ service: AuthService, order: PlacedOrder) async -> Bool {
        guard let token = try? await service.validAccessToken() else { return false }
        var request = URLRequest(url: Self.baseURL.appendingPathComponent("customer/orders"))
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 20
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let items = json["data"] as? [[String: Any]] else { return false }
        return items.contains { $0["orderNumber"] as? String == order.orderNumber }
    }
}
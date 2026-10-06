import Foundation
import Testing
@testable import Labna

/// Checkout behaviour that does not need a running API: request shape, gating,
/// duplicate submission, and the cart only being cleared once an order exists.
///
/// The live behaviour is covered by `CheckoutLiveBackendTests`.
@MainActor
@Suite(.serialized)
struct CheckoutStoreTests {
    private let container = PersistenceContainer.make(inMemory: true)
    private let baseURL = URL(string: "http://127.0.0.1:3001/api/v1")!

    /// A recording backend that answers the validation call and the order call
    /// with whatever the test sets up.
    private final class Backend: URLProtocol, @unchecked Sendable {
        struct Stub {
            var validationBody: Data?
            var orderBody: Data?
            var orderStatus = 201
            var orderRequests: [[String: Any]] = []
            var validationRequests: [[String: Any]] = []
            var delayOrderResponse: Duration = .zero
            /// JSON object returned as the signed-in customer by `/customer/me`.
            var meCustomerJSON: [String: Any] = [
                "id": "cust-1",
                "name": "Tester",
                "phoneNumber": "+201012345678",
                "email": "tester@example.com",
                "addresses": [addressJSON],
                "createdAt": "2026-01-01T00:00:00.000Z"
            ]
        }

        private static let lock = NSLock()
        nonisolated(unsafe) private static var stub = Stub()

        static func set(_ value: Stub) {
            lock.withLock {
                // Keep the customer payload unless the test replaces everything.
                var next = value
                next.meCustomerJSON = stub.meCustomerJSON
                stub = next
            }
        }

        static func setCustomer(
            id: String,
            name: String,
            phoneNumber: String,
            email: String,
            addresses: [[String: Any]]
        ) {
            lock.withLock {
                var next = stub
                next.meCustomerJSON = [
                    "id": id, "name": name, "phoneNumber": phoneNumber, "email": email,
                    "addresses": addresses, "createdAt": "2026-01-01T00:00:00.000Z"
                ]
                stub = next
            }
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
            let body = body(of: request) ?? Data("{}".utf8)
            let isValidation = url.path.hasSuffix("/cart/validate")
            let isOrder = url.path.hasSuffix("/orders")
            let isRefresh = url.path.contains("/customer/auth/refresh")
            let isMe = url.path.hasSuffix("/customer/me")
            let json = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] ?? [:]

            Self.lock.lock()
            var stub = Self.stub
            if isValidation {
                stub.validationRequests.append(json)
            } else if isOrder {
                stub.orderRequests.append(json)
            }
            Self.stub = stub
            Self.lock.unlock()

            // Only the refresh call is rejected. Rejecting it is what lets a test
            // reach the "session expired" path, because the service otherwise
            // tries to renew the token before giving up.
            if isRefresh {
                respond(Fixtures.error(code: "UNAUTHORIZED", status: 401), status: 401, to: url)
                return
            }
            if isMe {
                respond(Fixtures.me(Self.stub.meCustomerJSON), status: 200, to: url)
                return
            }

            let payload = isValidation ? Self.stub.validationBody : Self.stub.orderBody
            let status = isValidation ? 200 : Self.stub.orderStatus
            let delay = Self.stub.delayOrderResponse
            guard let payload else {
                client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
                return
            }
            if isValidation {
                respond(payload, status: status, to: url)
            } else {
                Task {
                    if delay > .zero { try? await Task.sleep(for: delay) }
                    respond(payload, status: status, to: url)
                }
            }
        }

        static let addressJSON: [String: Any] = [
            "id": "addr-1", "label": "Home", "city": "Cairo", "area": "Maadi",
            "street": "Road 9", "building": "12", "floor": "3", "apartment": "5",
            "notes": "Ring twice", "recipientName": "Tester",
            "phoneNumber": "+201012345678", "isDefault": true
        ]

        private func respond(_ payload: Data, status: Int, to url: URL) {
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
            client?.urlProtocol(self, didLoad: payload)
            client?.urlProtocolDidFinishLoading(self)
        }

        private func body(of request: URLRequest) -> Data? {
            if let stream = request.httpBodyStream {
                stream.open()
                var data = Data()
                var buffer = [UInt8](repeating: 0, count: 4_096)
                while stream.hasBytesAvailable {
                    let read = stream.read(&buffer, maxLength: buffer.count)
                    if read <= 0 { break }
                    data.append(buffer, count: read)
                }
                stream.close()
                return data
            }
            return request.httpBody
        }
    }

    // MARK: - Fixtures

    private enum Fixtures {
        static func me(_ customer: [String: Any]) -> Data {
            let body = (try? JSONSerialization.data(withJSONObject: customer)) ?? Data()
            return envelope(String(decoding: body, as: UTF8.self))
        }

        static func envelope(_ data: String) -> Data {
            Data(#"{"data":\#(data),"meta":{"requestID":"r"}}"#.utf8)
        }

        /// A `cart/validate` answer that confirms one in-stock line.
        static func validationOK(unitPriceMinor: Int = 1_800, quantity: Int = 2) -> Data {
            envelope("""
            {"branchID":"demo-cairo","currencyCode":"EGP","items":[{"productID":"milk-full","variantID":"milk-full-250","quantity":\(quantity),"productName":{"ar":"لبن","en":"Milk"},"variantLabel":{"ar":"250","en":"250"},"imageURL":"https://example.test/m.png","unit":"ml","variantQuantity":250,"currencyCode":"EGP","unitPriceMinor":\(unitPriceMinor),"lineTotalMinor":\(unitPriceMinor * quantity),"availableQuantity":40,"valid":true,"reason":"ok"}],"subtotalMinor":\(unitPriceMinor * quantity),"valid":true}
            """)
        }

        static func validationBlocking(reason: String, availableQuantity: Int = 0) -> Data {
            envelope("""
            {"branchID":"demo-cairo","currencyCode":"EGP","items":[{"productID":"milk-full","variantID":"milk-full-250","quantity":2,"productName":{"ar":"لبن","en":"Milk"},"variantLabel":{"ar":"250","en":"250"},"imageURL":"https://example.test/m.png","unit":"ml","variantQuantity":250,"currencyCode":"EGP","unitPriceMinor":0,"lineTotalMinor":0,"availableQuantity":\(availableQuantity),"valid":false,"reason":"\(reason)"}],"subtotalMinor":0,"valid":false}
            """)
        }

        static func order(
            orderNumber: String = "LBN-20260101-123456",
            subtotalMinor: Int = 3_600,
            deliveryFeeMinor: Int = 1_500,
            discountMinor: Int = 0,
            couponCode: String = ""
        ) -> Data {
            envelope("""
            {"id":"9f0f0d3e-1b1a-4c1e-9a3f-2b7f5b7a1c22","orderNumber":"\(orderNumber)","customerID":null,"customer":{"name":"Tester","phoneNumber":"+201012345678","email":null},"address":{"city":"Cairo","area":"Maadi","street":"Road 9","building":"12","floor":"","apartment":"","notes":""},"branchID":"demo-cairo","items":[{"productID":"milk-full","variantID":"milk-full-250","productName":{"ar":"لبن","en":"Milk"},"variantLabel":{"ar":"250","en":"250"},"imageURL":"https://example.test/m.png","quantity":2,"unitPriceMinor":1800,"lineTotalMinor":3600}],"currencyCode":"EGP","subtotalMinor":\(subtotalMinor),"deliveryFeeMinor":\(deliveryFeeMinor),"discountMinor":\(discountMinor),"totalMinor":\(max(0, subtotalMinor + deliveryFeeMinor - discountMinor)),"couponCode":"\(couponCode)","payment":{"method":"cash_on_delivery","status":"pending","providerReference":null},"status":"pending","statusHistory":[{"status":"pending","at":"2026-01-01T00:00:00.000Z","actorID":null}],"createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}
            """)
        }

        static func error(code: String, status: Int, details: String? = nil) -> Data {
            let detailText = details.map { ",\"details\":\($0)" } ?? ""
            return Data(#"{"error":{"code":"\#(code)","message":"m"\#(detailText)},"meta":{"requestID":"r"}}"#.utf8)
        }
    }

    private func products() throws -> [Product] {
        let url = try #require(Bundle.main.url(forResource: "products", withExtension: "json"))
        return try JSONDecoder().decode([Product].self, from: Data(contentsOf: url))
    }

    /// A signed-in customer with one saved address and a two-line cart.
    private func scenario(
        quantity: Int = 2,
        customer: Customer? = nil
    ) async throws -> (cart: CartStore, auth: AuthStore, service: AuthService, addresses: [CustomerAddress]) {
        let all = try products()
        let product = try #require(all.first { $0.id == "milk-full" })
        let variant = try #require(product.variants.first { $0.id == "milk-full-250" })
        let address = CustomerAddress(
            id: "addr-1",
            label: "Home",
            city: "Cairo",
            area: "Maadi",
            street: "Road 9",
            building: "12",
            floor: "3",
            apartment: "5",
            notes: "Ring twice",
            recipientName: "Tester",
            phoneNumber: "+201012345678",
            isDefault: true
        )
        let account = customer ?? Customer(
            id: "cust-1",
            name: "Tester",
            phoneNumber: "+201012345678",
            email: "tester@example.com",
            addresses: [address],
            createdAt: "2026-01-01T00:00:00.000Z"
        )
        let storage = MemorySessionStore(AuthSession(
            accessToken: "token",
            accessTokenExpiresAt: Date().addingTimeInterval(900),
            refreshCookie: "cookie",
            customer: account
        ))
        let service = AuthService(baseURL: baseURL, session: Backend.session(), storage: storage)
        // The stub answers `/customer/me` with this customer, so the restored
        // session matches what the test set up.
        Backend.setCustomer(
            id: account.id,
            name: account.name,
            phoneNumber: account.phoneNumber,
            email: account.email,
            addresses: account.addresses.map { address in
                [
                    "id": address.id, "label": address.label, "city": address.city,
                    "area": address.area, "street": address.street, "building": address.building,
                    "floor": address.floor ?? "", "apartment": address.apartment ?? "",
                    "notes": address.notes ?? "", "recipientName": address.recipientName ?? "",
                    "phoneNumber": address.phoneNumber ?? "", "isDefault": address.isDefault
                ]
            }
        )
        let auth = AuthStore(service: service)
        // Checkout reads the address book and contact details off the session, so
        // the customer has to be restored the way the app does at launch.
        await auth.restore()
        let cart = CartStore(modelContainer: container)
        cart.removeAll()
        cart.review(using: [product])
        cart.add(product: product, variant: variant, quantity: quantity)
        return (cart, auth, service, [address])
    }

    /// The checkout store must share the very service the account restored, so
    /// the order carries the signed-in customer's token.
    private func makeStore(
        cart: CartStore,
        auth: AuthStore,
        service: AuthService
    ) -> (checkout: CheckoutStore, validation: CartValidationStore) {
        let validation = CartValidationStore(
            service: CartValidationService(baseURL: baseURL, session: Backend.session()),
            cart: cart
        )
        let checkout = CheckoutStore(
            service: service,
            auth: auth,
            cart: cart,
            cartValidation: validation
        )
        checkout.prepare()
        return (checkout, validation)
    }

    // MARK: - Successful checkout

    @Test func aConfirmedCartCreatesAnOrderAndClearsTheCart() async throws {
        Backend.set(.init(validationBody: Fixtures.validationOK(), orderBody: Fixtures.order()))
        let (cart, auth, service, _) = try await scenario()
        let (checkout, _) = makeStore(cart: cart, auth: auth, service: service)

        let order = try await checkout.submit(notes: "Leave at the door")

        let placed = try #require(order)
        #expect(placed.orderNumber == "LBN-20260101-123456")
        #expect(placed.status == .pending)
        #expect(placed.payment.method == .cashOnDelivery)
        #expect(placed.totalMinor == 3_600 + 1_500)
        // Only a confirmed order empties the cart.
        #expect(cart.items.isEmpty)
        #expect(checkout.failure == nil)
        #expect(checkout.placedOrder == placed)
    }

    @Test func theRequestSendsOnlyIdentifiersQuantitiesAndSelections() async throws {
        Backend.set(.init(validationBody: Fixtures.validationOK(), orderBody: Fixtures.order()))
        let (cart, auth, service, _) = try await scenario()
        let (checkout, _) = makeStore(cart: cart, auth: auth, service: service)
        checkout.updateCoupon("labna10")

        _ = try await checkout.submit(notes: "Call on arrival")

        let body = try #require(Backend.current.orderRequests.first)
        // No price, fee, discount or total may be asserted by the device.
        #expect(body.keys.sorted() == ["address", "couponCode", "customer", "items", "paymentMethod"])
        let items = try #require(body["items"] as? [[String: Any]])
        #expect(items.count == 1)
        #expect(Set(try #require(items.first).keys) == ["productID", "variantID", "quantity"])
        #expect(items.first?["quantity"] as? Int == 2)
        #expect(body["couponCode"] as? String == "LABNA10", "Coupon codes are normalised before sending")
        #expect(body["paymentMethod"] as? String == "cash_on_delivery")

        let customer = try #require(body["customer"] as? [String: Any])
        #expect(customer["name"] as? String == "Tester")
        #expect(customer["phoneNumber"] as? String == "+201012345678")

        // The saved address is reused, with the shopper's note appended.
        let address = try #require(body["address"] as? [String: Any])
        #expect(address["city"] as? String == "Cairo")
        #expect(address["building"] as? String == "12")
        #expect((address["notes"] as? String)?.contains("Call on arrival") == true)
    }

    @Test func theCartIsValidatedAgainImmediatelyBeforeSubmitting() async throws {
        Backend.set(.init(validationBody: Fixtures.validationOK(), orderBody: Fixtures.order()))
        let (cart, auth, service, _) = try await scenario()
        let (checkout, validation) = makeStore(cart: cart, auth: auth, service: service)

        #expect(Backend.current.validationRequests.isEmpty, "Nothing is asked before the shopper submits")
        _ = try await checkout.submit(notes: "")
        #expect(Backend.current.validationRequests.count == 1)
        #expect(validation.isCheckoutReady == false, "The verdict is dropped once the order empties the cart")
    }

    @Test func couponDiscountsAreReportedFromTheServer() async throws {
        Backend.set(.init(
            validationBody: Fixtures.validationOK(),
            orderBody: Fixtures.order(orderNumber: "LBN-20260101-654321", discountMinor: 360, couponCode: "LABNA10")
        ))
        let (cart, auth, service, _) = try await scenario()
        let (checkout, _) = makeStore(cart: cart, auth: auth, service: service)
        checkout.updateCoupon("LABNA10")

        let order = try #require(try await checkout.submit(notes: ""))
        #expect(order.couponApplied)
        #expect(order.discountMinor == 360)
        #expect(order.couponIgnored == false)
        #expect(order.totalMinor == 3_600 + 1_500 - 360)
    }

    @Test func anUnknownCouponIsReportedRatherThanSilentlyIgnored() async throws {
        // The API accepts any code and simply grants no discount.
        Backend.set(.init(
            validationBody: Fixtures.validationOK(),
            orderBody: Fixtures.order(discountMinor: 0, couponCode: "NOPE")
        ))
        let (cart, auth, service, _) = try await scenario()
        let (checkout, _) = makeStore(cart: cart, auth: auth, service: service)
        checkout.updateCoupon("NOPE")

        let order = try #require(try await checkout.submit(notes: ""))
        #expect(order.couponApplied == false)
        #expect(order.couponIgnored)
        #expect(order.discountMinor == 0)
    }

    // MARK: - Blocking failures

    @Test func anUnconfirmedCartNeverReachesTheOrderEndpoint() async throws {
        Backend.set(.init(
            validationBody: Fixtures.validationBlocking(reason: "insufficient_stock", availableQuantity: 1),
            orderBody: Fixtures.order()
        ))
        let (cart, auth, service, _) = try await scenario()
        let (checkout, _) = makeStore(cart: cart, auth: auth, service: service)

        let order = await checkout.submit(notes: "")

        #expect(order == nil)
        #expect(Backend.current.orderRequests.isEmpty, "No order may be attempted for a cart the server refused")
        #expect(checkout.failure == .cartNotConfirmed([.insufficientStock]))
        // The cart survives so the shopper can fix the quantity.
        #expect(cart.items.count == 1)
    }

    @Test func anUnavailableLineBlocksTheOrder() async throws {
        Backend.set(.init(
            validationBody: Fixtures.validationBlocking(reason: "unavailable"),
            orderBody: Fixtures.order()
        ))
        let (cart, auth, service, _) = try await scenario()
        let (checkout, _) = makeStore(cart: cart, auth: auth, service: service)

        #expect(await checkout.submit(notes: "") == nil)
        #expect(checkout.failure == .cartNotConfirmed([.unavailable]))
        #expect(cart.items.count == 1)
    }

    @Test func aChangedPriceIsAcceptedButPricedByTheServer() async throws {
        // Validation succeeds at a price the device never proposed.
        Backend.set(.init(validationBody: Fixtures.validationOK(unitPriceMinor: 2_400), orderBody: Fixtures.order(subtotalMinor: 4_800)))
        let (cart, auth, service, _) = try await scenario()
        let (checkout, validation) = makeStore(cart: cart, auth: auth, service: service)

        let order = try #require(try await checkout.submit(notes: ""))

        #expect(order.subtotalMinor == 4_800, "The order carries the server's price, not the cart's")
        #expect(order.totalMinor == 4_800 + 1_500)
        #expect(cart.items.isEmpty)
    }

    @Test func stockExhaustedAtSubmissionKeepsTheCartAndNamesTheLine() async throws {
        Backend.set(.init(
            validationBody: Fixtures.validationOK(),
            orderBody: Fixtures.error(
                code: "INSUFFICIENT_STOCK",
                status: 409,
                details: #"{"productID":"milk-full","variantID":"milk-full-250","availableQuantity":1}"#
            ),
            orderStatus: 409
        ))
        let (cart, auth, service, _) = try await scenario()
        let (checkout, _) = makeStore(cart: cart, auth: auth, service: service)

        let order = await checkout.submit(notes: "")

        #expect(order == nil)
        #expect(checkout.failure == .rejected(.insufficientStock(
            productID: "milk-full",
            variantID: "milk-full-250",
            availableQuantity: 1
        )))
        // The order was not created, so the cart must stay intact.
        #expect(cart.items.count == 1)
    }

    @Test func aDeletedProductAtSubmissionKeepsTheCart() async throws {
        Backend.set(.init(
            validationBody: Fixtures.validationOK(),
            orderBody: Fixtures.error(code: "PRODUCT_UNAVAILABLE", status: 422, details: #"{"productID":"milk-full"}"#),
            orderStatus: 422
        ))
        let (cart, auth, service, _) = try await scenario()
        let (checkout, _) = makeStore(cart: cart, auth: auth, service: service)

        #expect(await checkout.submit(notes: "") == nil)
        #expect(checkout.failure == .rejected(.productUnavailable(productID: "milk-full")))
        #expect(cart.items.count == 1)
    }

    @Test func aRetiredPackAtSubmissionKeepsTheCart() async throws {
        Backend.set(.init(
            validationBody: Fixtures.validationOK(),
            orderBody: Fixtures.error(
                code: "VARIANT_UNAVAILABLE",
                status: 422,
                details: #"{"productID":"milk-full","variantID":"milk-full-250"}"#
            ),
            orderStatus: 422
        ))
        let (cart, auth, service, _) = try await scenario()
        let (checkout, _) = makeStore(cart: cart, auth: auth, service: service)

        #expect(await checkout.submit(notes: "") == nil)
        #expect(checkout.failure == CheckoutFailure.rejected(
            .variantUnavailable(productID: "milk-full", variantID: "milk-full-250")
        ))
        #expect(cart.items.count == 1)
    }

    @Test func anExpiredSessionIsReportedAndEndsTheLocalSession() async throws {
        Backend.set(.init(
            validationBody: Fixtures.validationOK(),
            orderBody: Fixtures.error(code: "UNAUTHORIZED", status: 401),
            orderStatus: 401
        ))
        let (cart, auth, service, _) = try await scenario()
        let (checkout, _) = makeStore(cart: cart, auth: auth, service: service)

        #expect(await checkout.submit(notes: "") == nil)
        #expect(checkout.failure == .sessionExpired)
        #expect(auth.isAuthenticated == false)
        #expect(cart.items.count == 1)
    }

    @Test func aServerFailureIsReportedWithoutClearingTheCart() async throws {
        Backend.set(.init(
            validationBody: Fixtures.validationOK(),
            orderBody: Fixtures.error(code: "INTERNAL", status: 500),
            orderStatus: 500
        ))
        let (cart, auth, service, _) = try await scenario()
        let (checkout, _) = makeStore(cart: cart, auth: auth, service: service)

        #expect(await checkout.submit(notes: "") == nil)
        #expect(checkout.failure == .server)
        #expect(cart.items.count == 1)
    }

    @Test func anUnreachableStoreIsReportedAsOffline() async throws {
        Backend.set(.init(
            validationBody: Fixtures.validationOK(),
            orderBody: nil
        ))
        Backend.set(.init(
            validationBody: Fixtures.validationOK(),
            orderBody: Fixtures.error(code: "X", status: 503),
            orderStatus: 503
        ))
        let (cart, auth, service, _) = try await scenario()
        let (checkout, _) = makeStore(cart: cart, auth: auth, service: service)

        #expect(await checkout.submit(notes: "") == nil)
        #expect(checkout.failure == .server)
        #expect(cart.items.count == 1)
    }

    // MARK: - Client side gating

    @Test func anEmptyCartCannotBeSubmitted() async throws {
        Backend.set(.init(validationBody: Fixtures.validationOK(), orderBody: Fixtures.order()))
        let (cart, auth, service, _) = try await scenario()
        cart.removeAll()
        let (checkout, _) = makeStore(cart: cart, auth: auth, service: service)

        #expect(await checkout.submit(notes: "") == nil)
        #expect(checkout.failure == .emptyCart)
        #expect(Backend.current.orderRequests.isEmpty)
    }

    @Test func aMissingSavedAddressBlocksSubmission() async throws {
        Backend.set(.init(validationBody: Fixtures.validationOK(), orderBody: Fixtures.order()))
        let account = Customer(
            id: "cust-2",
            name: "Tester",
            phoneNumber: "+201012345678",
            email: "",
            addresses: [],
            createdAt: "2026-01-01T00:00:00.000Z"
        )
        let (cart, auth, service, _) = try await scenario(customer: account)
        let (checkout, _) = makeStore(cart: cart, auth: auth, service: service)

        #expect(checkout.selectedAddressID == nil)
        #expect(checkout.blockingReason == CheckoutFailure.missingAddress)
        #expect(await checkout.submit(notes: "") == nil)
        #expect(checkout.failure == CheckoutFailure.missingAddress)
        #expect(Backend.current.orderRequests.isEmpty)
        #expect(cart.items.count == 1)
    }

    @Test func invalidContactDetailsBlockSubmission() async throws {
        Backend.set(.init(validationBody: Fixtures.validationOK(), orderBody: Fixtures.order()))
        let (cart, auth, service, _) = try await scenario()
        let (checkout, _) = makeStore(cart: cart, auth: auth, service: service)

        checkout.updateContact(ProfileDraft(name: "X", phoneNumber: "1234", email: ""))

        #expect(checkout.blockingReason == .invalidContact)
        #expect(await checkout.submit(notes: "") == nil)
        #expect(checkout.failure == .invalidContact)
        #expect(Backend.current.orderRequests.isEmpty)
    }

    @Test func theDefaultSavedAddressIsPreselected() async throws {
        Backend.set(.init(validationBody: Fixtures.validationOK(), orderBody: Fixtures.order()))
        let (cart, auth, service, addresses) = try await scenario()
        let (checkout, _) = makeStore(cart: cart, auth: auth, service: service)

        #expect(checkout.selectedAddressID == addresses.first?.id)
        #expect(checkout.blockingReason == nil)

        checkout.select(addressID: nil)
        #expect(checkout.blockingReason == CheckoutFailure.missingAddress)
    }

    // MARK: - Duplicate submission

    @Test func aSecondSubmitJoinsTheFirstInsteadOfCreatingAnotherOrder() async throws {
        Backend.set(.init(
            validationBody: Fixtures.validationOK(),
            orderBody: Fixtures.order(),
            delayOrderResponse: .milliseconds(400)
        ))
        let (cart, auth, service, _) = try await scenario()
        let (checkout, _) = makeStore(cart: cart, auth: auth, service: service)

        async let first = checkout.submit(notes: "")
        async let second = checkout.submit(notes: "")
        let (one, two) = await (first, second)

        #expect(one != nil)
        #expect(two != nil)
        #expect(one?.orderNumber == two?.orderNumber, "Both callers see the same order")
        #expect(Backend.current.orderRequests.count == 1, "The API must only be asked once")
    }

    @Test func theSubmitButtonIsDisabledWhileAnOrderIsInFlight() async throws {
        Backend.set(.init(
            validationBody: Fixtures.validationOK(),
            orderBody: Fixtures.order(),
            delayOrderResponse: .milliseconds(300)
        ))
        let (cart, auth, service, _) = try await scenario()
        let (checkout, _) = makeStore(cart: cart, auth: auth, service: service)

        #expect(checkout.isBusy == false)
        let task = Task { await checkout.submit(notes: "") }
        // Give the validation round trip a moment to flip the flag.
        try await Task.sleep(for: .milliseconds(120))
        #expect(checkout.isBusy)
        #expect(checkout.isSubmitting)
        _ = await task.value
        #expect(checkout.isBusy == false)
    }

    @Test func aFailedAttemptCanBeRetried() async throws {
        Backend.set(.init(validationBody: Fixtures.validationOK(), orderBody: Fixtures.error(code: "INTERNAL", status: 500)))
        let (cart, auth, service, _) = try await scenario()
        let (checkout, _) = makeStore(cart: cart, auth: auth, service: service)

        #expect(await checkout.submit(notes: "") == nil)
        #expect(checkout.failure == .server)
        #expect(cart.items.count == 1)

        // The store recovers once the API is healthy again.
        Backend.set(.init(validationBody: Fixtures.validationOK(), orderBody: Fixtures.order()))
        let order = try #require(try await checkout.submit(notes: ""))
        #expect(order.orderNumber == "LBN-20260101-123456")
        #expect(checkout.failure == nil)
        #expect(cart.items.isEmpty)
    }
}

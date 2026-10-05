import Foundation
import Testing
@testable import Labna

private final class CartURLProtocol: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    private static var handler: ((URLRequest) throws -> (URLResponse, Data))?

    static func setHandler(_ value: ((URLRequest) throws -> (URLResponse, Data))?) {
        lock.lock()
        defer { lock.unlock() }
        handler = value
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lock.lock()
        let handler = Self.handler
        Self.lock.unlock()
        do {
            guard let handler else { throw URLError(.unknown) }
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

@MainActor
@Suite(.serialized)
struct CartValidationTests {
    private let container = PersistenceContainer.make(inMemory: true)

    private func session() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [CartURLProtocol.self]
        return URLSession(configuration: config)
    }

    private func store(_ cart: CartStore) -> CartValidationStore {
        CartValidationStore(service: CartValidationService(baseURL: baseURL, session: session()), cart: cart)
    }

    private var baseURL: URL { URL(string: "http://127.0.0.1:3001/api/v1")! }

    private func products() throws -> [Product] {
        let url = try #require(Bundle.main.url(forResource: "products", withExtension: "json"))
        return try JSONDecoder().decode([Product].self, from: Data(contentsOf: url))
    }

    /// Builds a cart through the real, persisted `CartStore` API so the tests
    /// exercise the same path the app uses.
    private func cart(quantity: Int = 2) throws -> (cart: CartStore, priceAtAdditionMinor: Int) {
        let product = try #require(products().first { $0.id == "milk-full" })
        let variant = try #require(product.variants.first { $0.id == "milk-full-1000" } ?? product.variants.first)
        let cart = CartStore(modelContainer: container)
        cart.removeAll()
        cart.review(using: [product])
        cart.add(product: product, variant: variant, quantity: quantity)
        return (cart, variant.priceMinor)
    }

    // MARK: - Request shape

    @Test func requestSendsOnlyIdentifiersAndQuantities() async throws {
        let (cart, _) = try cart(quantity: 3)
        let store = store(cart)
        var captured: [String: Any] = [:]
        CartURLProtocol.setHandler { request in
            let url = try #require(request.url)
            captured = try #require(bodyObject(from: request))
            return json(url: url, body: validBody(unitPrice: 5500, available: 40, subtotal: 11000))
        }
        defer { CartURLProtocol.setHandler(nil) }

        #expect(await store.validate())

        // Client prices and stock must never be sent to the server.
        #expect(captured["branchID"] == nil)
        let items = try #require(captured["items"] as? [[String: Any]])
        #expect(items.count == 1)
        #expect(Set(items[0].keys) == ["productID", "variantID", "quantity"])
        #expect(items[0]["productID"] as? String == "milk-full")
        #expect(items[0]["variantID"] as? String == "milk-full-1000")
        #expect(items[0]["quantity"] as? Int == 3)
        #expect(captured["priceAtAdditionMinor"] == nil)
        #expect(captured["subtotalMinor"] == nil)
    }

    @Test func requestTargetsTheCartValidateEndpoint() async throws {
        let (cart, _) = try cart()
        let store = store(cart)
        CartURLProtocol.setHandler { request in
            let url = try #require(request.url)
            #expect(url.path == "/api/v1/cart/validate")
            #expect(request.httpMethod == "POST")
            #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
            // Cart validation is a public endpoint and carries no customer token.
            #expect(request.value(forHTTPHeaderField: "Authorization") == nil)
            return json(url: url, body: validBody(unitPrice: 5500, available: 40, subtotal: 11000))
        }
        defer { CartURLProtocol.setHandler(nil) }

        #expect(await store.validate())
    }

    // MARK: - Valid cart

    @Test func validCartUnlocksCheckoutAndUsesServerTotal() async throws {
        let (cart, _) = try cart(quantity: 2)
        let store = store(cart)
        CartURLProtocol.setHandler { request in
            let url = try #require(request.url)
            return json(url: url, body: validBody(unitPrice: 5500, available: 40, subtotal: 11000))
        }
        defer { CartURLProtocol.setHandler(nil) }

        #expect(await store.validate())
        #expect(store.isServerValidated)
        #expect(store.isCheckoutReady)
        #expect(store.blockingItems.isEmpty)
        // Totals come from the server, not from local arithmetic.
        #expect(store.subtotalMinor == 11000)
        #expect(store.currencyCode == "EGP")
        #expect(store.result?.branchID == "demo-cairo")
        #expect(store.verdict(for: CartItem.ID(productID: "milk-full", variantID: "milk-full-1000"))?.valid == true)
    }

    @Test func serverPriceIsAuthoritativeAndFlagsTheChange() async throws {
        let (cart, priceAtAddition) = try cart(quantity: 2)
        let store = store(cart)
        let serverPrice = priceAtAddition + 900
        CartURLProtocol.setHandler { request in
            let url = try #require(request.url)
            return json(url: url, body: validBody(unitPrice: serverPrice, available: 40, subtotal: serverPrice * 2))
        }
        defer { CartURLProtocol.setHandler(nil) }

        #expect(await store.validate())
        let verdict = try #require(store.verdict(for: CartItem.ID(productID: "milk-full", variantID: "milk-full-1000")))
        #expect(verdict.unitPriceMinor == serverPrice)
        // "price at addition → current server price"
        #expect(verdict.priceChanged(from: priceAtAddition))
        #expect(!verdict.priceChanged(from: serverPrice))
        #expect(store.subtotalMinor == serverPrice * 2)
    }

    // MARK: - Blocking server results

    @Test func unavailableItemBlocksCheckout() async throws {
        let (cart, _) = try cart()
        let store = store(cart)
        CartURLProtocol.setHandler { request in
            let url = try #require(request.url)
            return json(url: url, body: itemBody(unitPrice: 5500, available: 0, reason: "unavailable", subtotal: 0))
        }
        defer { CartURLProtocol.setHandler(nil) }

        #expect(!(await store.validate()))
        #expect(store.isServerValidated)
        #expect(!store.isCheckoutReady)
        #expect(store.blockingItems.count == 1)
        #expect(store.blockingItems.first?.reason == .unavailable)
        #expect(store.blockingItems.first?.availableQuantity == 0)
    }

    @Test func insufficientStockBlocksCheckoutAndReportsAvailableUnits() async throws {
        let (cart, _) = try cart(quantity: 10)
        let store = store(cart)
        CartURLProtocol.setHandler { request in
            let url = try #require(request.url)
            return json(url: url, body: itemBody(unitPrice: 5500, available: 4, reason: "insufficient_stock", subtotal: 0, quantity: 10))
        }
        defer { CartURLProtocol.setHandler(nil) }

        #expect(!(await store.validate()))
        #expect(!store.isCheckoutReady)
        let blocked = try #require(store.blockingItems.first)
        #expect(blocked.reason == .insufficientStock)
        #expect(blocked.availableQuantity == 4)
        #expect(blocked.quantity == 10)
    }

    @Test func deletedProductBlocksCheckout() async throws {
        let (cart, _) = try cart()
        let store = store(cart)
        CartURLProtocol.setHandler { request in
            let url = try #require(request.url)
            return json(url: url, body: notFoundBody(reason: "product_not_found"))
        }
        defer { CartURLProtocol.setHandler(nil) }

        #expect(!(await store.validate()))
        #expect(!store.isCheckoutReady)
        #expect(store.blockingItems.first?.reason == .productNotFound)
    }

    @Test func removedVariantBlocksCheckout() async throws {
        let (cart, _) = try cart()
        let store = store(cart)
        CartURLProtocol.setHandler { request in
            let url = try #require(request.url)
            return json(url: url, body: notFoundBody(reason: "variant_not_found"))
        }
        defer { CartURLProtocol.setHandler(nil) }

        #expect(!(await store.validate()))
        #expect(store.blockingItems.first?.reason == .variantNotFound)
    }

    @Test func everyServerReasonMapsToAMessageAndBlocks() {
        #expect(CartValidationReason.ok.isBlocking == false)
        for reason: CartValidationReason in [.productNotFound, .variantNotFound, .unavailable, .insufficientStock] {
            #expect(reason.isBlocking)
            #expect(reason != .ok)
        }
    }

    // MARK: - Failures and offline

    @Test func networkFailureLeavesCartUsableButCheckoutBlocked() async throws {
        let (cart, priceAtAddition) = try cart()
        let store = store(cart)
        CartURLProtocol.setHandler { _ in throw URLError(.notConnectedToInternet) }
        defer { CartURLProtocol.setHandler(nil) }

        #expect(!(await store.validate()))
        #expect(!store.isServerValidated)
        #expect(!store.isCheckoutReady)
        #expect(store.lastError == .network(.notConnectedToInternet))
        #expect(store.lastError?.isOffline == true)
        // The locally cached cart is untouched and still browsable.
        #expect(cart.items.count == 1)
        #expect(cart.totalQuantity == 2)
        #expect(cart.totalMinor == priceAtAddition * 2)
        #expect(cart.persistenceFailed == false)
    }

    @Test func missingPickupBranchIsReportedDistinctly() async throws {
        let (cart, _) = try cart()
        let store = store(cart)
        CartURLProtocol.setHandler { request in
            let url = try #require(request.url)
            return error(url: url, status: 503, code: "NO_PICKUP_BRANCH")
        }
        defer { CartURLProtocol.setHandler(nil) }

        #expect(!(await store.validate()))
        #expect(store.lastError == .noPickupBranch)
        #expect(!store.isCheckoutReady)
    }

    @Test func serverErrorIsReportedAsHTTPFailure() async throws {
        let (cart, _) = try cart()
        let store = store(cart)
        CartURLProtocol.setHandler { request in
            let url = try #require(request.url)
            return error(url: url, status: 500, code: "INTERNAL_ERROR")
        }
        defer { CartURLProtocol.setHandler(nil) }

        #expect(!(await store.validate()))
        #expect(store.lastError == .httpStatus(500))
    }

    // MARK: - Stale verdicts

    @Test func changingTheCartInvalidatesTheServerVerdict() async throws {
        let (cart, _) = try cart(quantity: 2)
        let store = store(cart)
        CartURLProtocol.setHandler { request in
            let url = try #require(request.url)
            return json(url: url, body: validBody(unitPrice: 5500, available: 40, subtotal: 11000))
        }
        defer { CartURLProtocol.setHandler(nil) }

        #expect(await store.validate())
        #expect(store.isCheckoutReady)

        let line = try #require(cart.items.first?.id)
        cart.setQuantity(cart.items[0].quantity + 1, for: line)

        // The old verdict described a different cart, so it must not unlock checkout.
        #expect(!store.isServerValidated)
        #expect(!store.isCheckoutReady)
        #expect(store.subtotalMinor == nil)
        #expect(store.verdict(for: line) == nil)
    }

    @Test func removingEveryLineResetsValidation() async throws {
        let (cart, _) = try cart()
        let store = store(cart)
        CartURLProtocol.setHandler { request in
            let url = try #require(request.url)
            return json(url: url, body: validBody(unitPrice: 5500, available: 40, subtotal: 11000))
        }
        defer { CartURLProtocol.setHandler(nil) }

        #expect(await store.validate())
        cart.removeAll()
        #expect(!(await store.validate()))
        #expect(store.phase == .idle)
        #expect(!store.isCheckoutReady)
    }

    @Test func repeatedValidationReusesTheMatchingVerdict() async throws {
        let (cart, _) = try cart()
        let store = store(cart)
        let counter = Counter()
        CartURLProtocol.setHandler { request in
            let url = try #require(request.url)
            counter.increment()
            return json(url: url, body: validBody(unitPrice: 5500, available: 40, subtotal: 11000))
        }
        defer { CartURLProtocol.setHandler(nil) }

        #expect(await store.validate())
        let first = counter.value
        #expect(await store.validate())
        #expect(await store.validate())
        #expect(counter.value == first)
    }

    @Test func concurrentValidationIssuesOneRequest() async throws {
        let (cart, _) = try cart()
        let store = store(cart)
        let counter = Counter()
        CartURLProtocol.setHandler { request in
            let url = try #require(request.url)
            counter.increment()
            Thread.sleep(forTimeInterval: 0.2)
            return json(url: url, body: validBody(unitPrice: 5500, available: 40, subtotal: 11000))
        }
        defer { CartURLProtocol.setHandler(nil) }

        await withTaskGroup(of: Void.self) { group in
            for _ in 0..<4 { group.addTask { _ = await store.validate() } }
        }
        #expect(counter.value == 1)
        #expect(store.isCheckoutReady)
    }

    @Test func offlineCartPersistsAcrossStoreInstancesWithoutValidation() throws {
        let persisted = PersistenceContainer.make(inMemory: true)
        let product = try #require(products().first { $0.id == "milk-full" })
        let variant = try #require(product.variants.first { $0.id == "milk-full-1000" } ?? product.variants.first)

        let first = CartStore(modelContainer: persisted)
        first.review(using: [product])
        first.add(product: product, variant: variant, quantity: 4)

        let restored = CartStore(modelContainer: persisted)
        restored.review(using: [product])
        #expect(restored.items.count == 1)
        #expect(restored.totalQuantity == 4)
        #expect(restored.persistenceFailed == false)

        // A fresh validation store for the restored cart starts unvalidated, so
        // cached state can never masquerade as checkout readiness.
        let validation = store(restored)
        #expect(validation.phase == .idle)
        #expect(!validation.isCheckoutReady)
        #expect(validation.subtotalMinor == nil)
    }
}

// MARK: - Helpers

private final class Counter: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0

    var value: Int {
        lock.lock()
        defer { lock.unlock() }
        return count
    }

    func increment() {
        lock.lock()
        count += 1
        lock.unlock()
    }
}

private func validBody(unitPrice: Int, available: Int, subtotal: Int, quantity: Int = 2) -> String {
    itemBody(unitPrice: unitPrice, available: available, reason: "ok", subtotal: subtotal, quantity: quantity)
}

private func itemBody(unitPrice: Int, available: Int, reason: String, subtotal: Int, quantity: Int = 2) -> String {
    let valid = reason == "ok"
    return """
    {"data":{"branchID":"demo-cairo","currencyCode":"EGP","items":[{
      "productID":"milk-full","variantID":"milk-full-1000","quantity":\(quantity),
      "productName":{"ar":"حليب كامل الدسم","en":"Full Cream Milk"},
      "variantLabel":{"ar":"1 لتر","en":"1 litre"},
      "imageURL":"https://images.example.com/milk.jpg","unit":"ml","variantQuantity":1000,
      "currencyCode":"EGP","unitPriceMinor":\(unitPrice),"lineTotalMinor":\(subtotal),
      "availableQuantity":\(available),"valid":\(valid),"reason":"\(reason)"
    }],"subtotalMinor":\(subtotal),"valid":\(valid)},"meta":{"requestID":"r"}}
    """
}

private func notFoundBody(reason: String) -> String {
    """
    {"data":{"branchID":"demo-cairo","currencyCode":"EGP","items":[{
      "productID":"milk-full","variantID":"milk-full-1000","quantity":2,
      "productName":{"ar":"غير متوفر","en":"Unavailable"},
      "variantLabel":{"ar":"غير متوفر","en":"Unavailable"},
      "imageURL":"https://images.example.com/missing.png","unit":"ml","variantQuantity":1,
      "currencyCode":"EGP","unitPriceMinor":0,"lineTotalMinor":0,
      "availableQuantity":0,"valid":false,"reason":"\(reason)"
    }],"subtotalMinor":0,"valid":false},"meta":{"requestID":"r"}}
    """
}

private func json(url: URL, body: String) -> (URLResponse, Data) {
    (HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data(body.utf8))
}

private func error(url: URL, status: Int, code: String) -> (URLResponse, Data) {
    (
        HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!,
        Data("{\"error\":{\"code\":\"\(code)\",\"message\":\"failed\"},\"meta\":{\"requestID\":\"r\"}}".utf8)
    )
}

private func bodyObject(from request: URLRequest) -> [String: Any]? {
    guard let data = bodyData(from: request),
          let object = try? JSONSerialization.jsonObject(with: data) else { return nil }
    return object as? [String: Any]
}

/// `URLSession` hands a body to a `URLProtocol` as a stream rather than as
/// `httpBody`, so both forms have to be handled.
private func bodyData(from request: URLRequest) -> Data? {
    if let body = request.httpBody { return body }
    guard let stream = request.httpBodyStream else { return nil }
    stream.open()
    defer { stream.close() }
    var data = Data()
    let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 1024)
    defer { buffer.deallocate() }
    while stream.hasBytesAvailable {
        let count = stream.read(buffer, maxLength: 1024)
        if count < 0 { return nil }
        if count == 0 { break }
        data.append(buffer, count: count)
    }
    return data
}
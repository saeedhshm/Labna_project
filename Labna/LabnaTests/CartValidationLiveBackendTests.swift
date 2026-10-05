import Foundation
import Testing
@testable import Labna

/// Verifies cart validation against the API running on `127.0.0.1:3001`.
///
/// The stubbed suite in `CartValidationTests` proves the app reacts to each
/// verdict. These tests prove the verdicts themselves are real, by checking
/// `POST /cart/validate` against the seeded catalog and stock:
///
/// - the server's unit price is what the cart must show, and a line added at an
///   older price is flagged as changed rather than silently repriced,
/// - `unavailable` (nothing in stock) is distinct from `insufficient_stock`
///   (some stock, not enough),
/// - an archived product is reported as `product_not_found`, not as a price or
///   stock problem,
/// - an inactive line reports zero available units even when the inventory row
///   still holds stock,
/// - only identifiers and quantities are ever sent, and totals come back from
///   the server.
///
/// Every fixture below is read-only: no test writes to the database.
///
/// Skips itself when the backend is unreachable so the suite still runs without
/// `npm run dev:api`.
@MainActor
@Suite(.serialized)
struct CartValidationLiveBackendTests {
    private static let baseURL = URL(string: "http://127.0.0.1:3001/api/v1")!

    /// Published, in stock at the default pickup branch, with two units reserved
    /// so the available figure is deliberately lower than the requested amount.
    private static let inStockProduct = "milk-full"
    private static let inStockVariant = "milk-full-250"
    private static let serverUnitPriceMinor = 1_800

    /// Published product whose variant is switched off in the catalog, so the
    /// server must treat it as having no stock at all.
    private static let inactiveVariant = "milk-buffalo-1000"

    /// Archived product, so the server cannot find it at all.
    private static let archivedProduct = "zz-multi-image-check"

    private func backendIsReachable() async -> Bool {
        var request = URLRequest(url: Self.baseURL.appendingPathComponent("products"))
        request.timeoutInterval = 3
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        guard let (_, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse else { return false }
        return (200..<300).contains(http.statusCode)
    }

    private let container = PersistenceContainer.make(inMemory: true)

    private func makeService() -> CartValidationService {
        CartValidationService(baseURL: Self.baseURL)
    }

    private func products() throws -> [Product] {
        let url = try #require(Bundle.main.url(forResource: "products", withExtension: "json"))
        return try JSONDecoder().decode([Product].self, from: Data(contentsOf: url))
    }

    /// Builds a cart through the real, persisted `CartStore` API so the store
    /// level tests exercise the same path the app uses.
    private func cart(productID: String, variantID: String, quantity: Int) throws -> CartStore {
        let product = try #require(products().first { $0.id == productID })
        let variant = try #require(product.variants.first { $0.id == variantID })
        let store = CartStore(modelContainer: container)
        store.removeAll()
        store.review(using: [product])
        store.add(product: product, variant: variant, quantity: quantity)
        return store
    }

    private func item(
        productID: String,
        variantID: String,
        quantity: Int,
        priceAtAdditionMinor: Int = CartValidationLiveBackendTests.serverUnitPriceMinor
    ) -> CartItem {
        CartItem(
            productID: productID,
            variantID: variantID,
            quantity: quantity,
            productName: LocalizedText(ar: " locally", en: "Locally cached name"),
            variantLabel: LocalizedText(ar: "محلي", en: "Locally cached pack"),
            priceAtAdditionMinor: priceAtAdditionMinor,
            currencyCode: "EGP"
        )
    }

    @Test func aValidCartIsConfirmedWithServerAuthoritativeTotals() async throws {
        guard await backendIsReachable() else { return }
        let service = makeService()
        let result = try await service.validate(items: [
            item(productID: Self.inStockProduct, variantID: Self.inStockVariant, quantity: 2)
        ])

        #expect(result.valid)
        #expect(result.items.count == 1)
        let line = try #require(result.items.first)
        #expect(line.valid)
        #expect(line.reason == .ok)
        #expect(line.quantity == 2)
        #expect(line.currencyCode == "EGP")
        // Totals must be the server's arithmetic, not the client's.
        #expect(line.unitPriceMinor == Self.serverUnitPriceMinor)
        #expect(line.lineTotalMinor == 2 * Self.serverUnitPriceMinor)
        #expect(result.subtotalMinor == 2 * Self.serverUnitPriceMinor)
        #expect(line.availableQuantity > 0)
        // The default pickup branch is resolved by the server when omitted.
        #expect(!result.branchID.isEmpty)

        // An empty local cart is never checkout ready, whatever the server says.
        let empty = try cart(productID: Self.inStockProduct, variantID: Self.inStockVariant, quantity: 1)
        empty.removeAll()
        let emptyStore = CartValidationStore(service: service, cart: empty)
        let ready = await emptyStore.validate()
        #expect(ready == false)
        #expect(emptyStore.isCheckoutReady == false)
    }

    @Test func theServerPriceWinsAndAChangeIsFlaggedAgainstTheAdditionPrice() async throws {
        guard await backendIsReachable() else { return }
        let service = makeService()

        // A line added when the product was dearer than it is now.
        let staleAdditionPrice = Self.serverUnitPriceMinor + 700
        let result = try await service.validate(items: [
            item(
                productID: Self.inStockProduct,
                variantID: Self.inStockVariant,
                quantity: 1,
                priceAtAdditionMinor: staleAdditionPrice
            )
        ])
        let line = try #require(result.items.first)
        #expect(line.valid)
        // The server is authoritative for the price actually payable.
        #expect(line.unitPriceMinor == Self.serverUnitPriceMinor)
        // And the cart can tell the shopper the price moved.
        #expect(line.priceChanged(from: staleAdditionPrice))
        #expect(line.priceChanged(from: staleAdditionPrice - 1))

        // A line added at today's price must not be reported as changed.
        let unchanged = try await service.validate(items: [
            item(productID: Self.inStockProduct, variantID: Self.inStockVariant, quantity: 1)
        ])
        let unchangedLine = try #require(unchanged.items.first)
        #expect(unchangedLine.priceChanged(from: Self.serverUnitPriceMinor) == false)
    }

    @Test func askingForMoreThanTheAvailableStockBlocksCheckout() async throws {
        guard await backendIsReachable() else { return }
        let service = makeService()

        // Discover the real available quantity first, then ask for one more.
        let probe = try await service.validate(items: [
            item(productID: Self.inStockProduct, variantID: Self.inStockVariant, quantity: 1)
        ])
        let available = try #require(probe.items.first?.availableQuantity)
        #expect(available > 0)

        let result = try await service.validate(items: [
            item(productID: Self.inStockProduct, variantID: Self.inStockVariant, quantity: available + 1)
        ])
        let line = try #require(result.items.first)
        #expect(line.valid == false)
        #expect(line.reason == .insufficientStock)
        #expect(line.reason.isBlocking)
        #expect(line.availableQuantity == available, "The shopper must be told what is actually available")
        // A blocked line contributes nothing to the payable subtotal.
        #expect(line.lineTotalMinor == 0)
        #expect(result.subtotalMinor == 0)
        #expect(result.valid == false)
    }

    @Test func anInactiveLineIsUnavailableEvenWhenInventoryExists() async throws {
        guard await backendIsReachable() else { return }
        let service = makeService()
        let result = try await service.validate(items: [
            item(productID: "milk-buffalo", variantID: Self.inactiveVariant, quantity: 1)
        ])
        let line = try #require(result.items.first)

        #expect(line.valid == false)
        #expect(line.reason == .unavailable)
        #expect(line.reason.isBlocking)
        #expect(line.availableQuantity == 0)
        #expect(line.lineTotalMinor == 0)
        #expect(result.valid == false)
    }

    @Test func anArchivedProductIsReportedAsMissing() async throws {
        guard await backendIsReachable() else { return }
        let service = makeService()
        let result = try await service.validate(items: [
            item(productID: Self.archivedProduct, variantID: "zz-a", quantity: 1)
        ])
        let line = try #require(result.items.first)

        #expect(line.valid == false)
        #expect(line.reason == .productNotFound)
        #expect(line.reason.isBlocking)
        #expect(line.availableQuantity == 0)
        #expect(line.unitPriceMinor == 0)
        // The API still answers with a complete line so the cart can render it.
        #expect(!line.productName.value(for: .english).isEmpty)
        #expect(!line.imageURL.absoluteString.isEmpty)
        #expect(result.valid == false)
    }

    @Test func anUnknownVariantOnAKnownProductIsReportedSeparately() async throws {
        guard await backendIsReachable() else { return }
        let service = makeService()
        let result = try await service.validate(items: [
            item(productID: Self.inStockProduct, variantID: "no-such-variant", quantity: 1)
        ])
        let line = try #require(result.items.first)

        #expect(line.valid == false)
        #expect(line.reason == .variantNotFound)
        // The product name still comes back, because the product does exist.
        #expect(line.productName.value(for: .english).isEmpty == false)
    }

    @Test func oneBadLineDoesNotHideTheGoodOnes() async throws {
        guard await backendIsReachable() else { return }
        let service = makeService()
        let result = try await service.validate(items: [
            item(productID: Self.inStockProduct, variantID: Self.inStockVariant, quantity: 1),
            item(productID: "milk-buffalo", variantID: Self.inactiveVariant, quantity: 1),
            item(productID: Self.archivedProduct, variantID: "zz-b", quantity: 1)
        ])

        #expect(result.items.count == 3)
        #expect(result.valid == false)

        let good = try #require(result.items.first)
        #expect(good.valid)
        #expect(good.reason == .ok)

        let blocked = result.items.filter { !$0.valid }
        #expect(blocked.count == 2)
        #expect(blocked.contains { $0.reason == .unavailable })
        #expect(blocked.contains { $0.reason == .productNotFound })

        // Only the payable line is summed.
        #expect(result.subtotalMinor == Self.serverUnitPriceMinor)
    }

    @Test func theRequestCarriesOnlyIdentifiersAndQuantities() async throws {
        guard await backendIsReachable() else { return }
        // A recording session proves what actually goes over the wire, whatever
        // the local cart believes about prices and stock.
        CartRequestRecorder.reset()
        let service = CartValidationService(
            baseURL: Self.baseURL,
            session: CartRequestRecorder.recordingSession()
        )
        let result = try await service.validate(items: [
            item(
                productID: Self.inStockProduct,
                variantID: Self.inStockVariant,
                quantity: 3,
                priceAtAdditionMinor: 999_999
            )
        ])

        let body = try #require(CartRequestRecorder.lastBody)
        let decoded = try #require(
            try JSONSerialization.jsonObject(with: body) as? [String: Any]
        )
        let keys = Set(decoded.keys)
        #expect(keys == ["items", "branchID"] || keys == ["items"])
        // An absent branch must be omitted rather than sent as null, which the
        // strict schema would reject.
        #expect(decoded["branchID"] is NSNull == false)

        let items = try #require(decoded["items"] as? [[String: Any]])
        #expect(items.count == 1)
        let lineKeys = Set(try #require(items.first).keys)
        #expect(lineKeys == ["productID", "variantID", "quantity"])
        #expect(items.first?["quantity"] as? Int == 3)

        // The wildly wrong local price must not have influenced the answer.
        let verified = try #require(result.items.first)
        #expect(verified.unitPriceMinor == Self.serverUnitPriceMinor)
        #expect(verified.priceChanged(from: 999_999))
    }

    @Test func aSpecificBranchIsHonouredWhenRequested() async throws {
        guard await backendIsReachable() else { return }
        let service = makeService()
        let cairo = try await service.validate(
            items: [item(productID: Self.inStockProduct, variantID: Self.inStockVariant, quantity: 1)],
            branchID: "demo-cairo"
        )
        let alexandria = try await service.validate(
            items: [item(productID: Self.inStockProduct, variantID: Self.inStockVariant, quantity: 1)],
            branchID: "demo-alexandria"
        )

        #expect(cairo.branchID == "demo-cairo")
        #expect(alexandria.branchID == "demo-alexandria")
        // Stock is per branch, so the two answers may legitimately differ while
        // the price stays the catalog's.
        #expect(cairo.items.first?.unitPriceMinor == alexandria.items.first?.unitPriceMinor)
    }

    @Test func anUnknownBranchIsRejectedRatherThanSilentlyIgnored() async throws {
        guard await backendIsReachable() else { return }
        let service = makeService()
        do {
            _ = try await service.validate(
                items: [item(productID: Self.inStockProduct, variantID: Self.inStockVariant, quantity: 1)],
                branchID: "no-such-branch"
            )
            Issue.record("An unknown branch should be rejected")
        } catch let error as CartValidationError {
            #expect(error == .httpStatus(422))
        }
    }

    @Test func theStoreOnlyOffersCheckoutOnceTheServerAgrees() async throws {
        guard await backendIsReachable() else { return }
        let service = makeService()

        // A line the server will reject must not unlock checkout, even though
        // the local cart is perfectly happy with it. More than the branch holds
        // is the realistic case: the device has no idea how much is in stock.
        let available = try #require(try await service.validate(items: [
            item(productID: Self.inStockProduct, variantID: Self.inStockVariant, quantity: 1)
        ]).items.first?.availableQuantity)
        let blockedCart = try cart(
            productID: Self.inStockProduct,
            variantID: Self.inStockVariant,
            quantity: available + 1
        )
        let blockedStore = CartValidationStore(service: service, cart: blockedCart)
        let blocked = await blockedStore.validate()
        #expect(blocked == false)
        #expect(blockedStore.isCheckoutReady == false)
        #expect(blockedStore.isServerValidated, "The server did answer, it just said no")
        #expect(blockedStore.blockingItems.count == 1)

        // A cart the server accepts becomes checkout ready.
        let goodCart = try cart(
            productID: Self.inStockProduct,
            variantID: Self.inStockVariant,
            quantity: 1
        )
        let goodStore = CartValidationStore(service: service, cart: goodCart)
        let ready = await goodStore.validate()
        #expect(ready)
        #expect(goodStore.isCheckoutReady)
        #expect(goodStore.blockingItems.isEmpty)
        #expect(goodStore.subtotalMinor == Self.serverUnitPriceMinor)
        #expect(goodStore.currencyCode == "EGP")
    }

    @Test func aChangedCartLosesItsVerdictUntilRevalidated() async throws {
        guard await backendIsReachable() else { return }
        let service = makeService()
        let cart = try cart(productID: Self.inStockProduct, variantID: Self.inStockVariant, quantity: 1)
        let store = CartValidationStore(service: service, cart: cart)

        #expect(await store.validate())
        #expect(store.isCheckoutReady)

        // Changing a quantity invalidates the previous answer, because it no
        // longer describes what would be checked out.
        let line = try #require(cart.items.first)
        cart.setQuantity(2, for: line.id)
        #expect(store.isServerValidated == false)
        #expect(store.isCheckoutReady == false)
        #expect(store.result == nil)
        #expect(store.subtotalMinor == nil)

        // Re-validating picks up the new quantity and the server's new total.
        #expect(await store.validate())
        #expect(store.subtotalMinor == 2 * Self.serverUnitPriceMinor)
    }

    @Test func aLocalCartStaysUsableWhenTheServerCannotBeReached() async throws {
        // A session pointed at a closed port stands in for "no network", without
        // touching the shared offline-detection used by the rest of the app.
        let unreachable = CartValidationService(
            baseURL: URL(string: "http://127.0.0.1:9/api/v1")!,
            session: CartRequestRecorder.failingSession()
        )
        let cart = try cart(productID: Self.inStockProduct, variantID: Self.inStockVariant, quantity: 2)
        let store = CartValidationStore(service: unreachable, cart: cart)

        let ready = await store.validate()
        #expect(ready == false, "An unvalidated cart must never unlock checkout")
        #expect(store.isCheckoutReady == false)
        #expect(store.isServerValidated == false)
        #expect(store.lastError != nil)

        // The cart itself is untouched and still shows locally cached data.
        #expect(cart.items.count == 1)
        #expect(cart.items[0].quantity == 2)
        #expect(cart.items[0].priceAtAdditionMinor == Self.serverUnitPriceMinor)
        #expect(cart.totalMinor == 2 * Self.serverUnitPriceMinor)
        // The local price is still shown, but nothing claims it is confirmed.
        #expect(store.verdict(for: cart.items[0].id) == nil)
    }
}

/// Captures the request bodies the validation service sends, then relays them to
/// the real backend, so one test can assert on both the wire format and the
/// decoded verdict.
///
/// The capture is static because `URLProtocol` instances are created by the URL
/// loading system rather than by the test.
final class CartRequestRecorder: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var capturedBodies: [Data] = []

    static func reset() {
        lock.withLock { capturedBodies = [] }
    }

    static var lastBody: Data? {
        lock.withLock { capturedBodies.last }
    }

    /// A session that records what it sends and still talks to the real API.
    static func recordingSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [CartRequestRecorder.self]
        return URLSession(configuration: configuration)
    }

    /// A session whose every request fails at the transport layer.
    static func failingSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [FailingURLProtocol.self]
        return URLSession(configuration: configuration)
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        var request = self.request
        // Reading the stream forces URLProtocol to buffer the body.
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
            Self.lock.withLock { Self.capturedBodies.append(data) }
            request.httpBodyStream = nil
            request.httpBody = data
        } else if let body = request.httpBody {
            Self.lock.withLock { Self.capturedBodies.append(body) }
        }

        relay(request)
    }

    private func relay(_ request: URLRequest) {
        URLSession.shared.dataTask(with: request) { [client] data, response, error in
            if let error {
                client?.urlProtocol(self, didFailWithError: error)
                return
            }
            if let response {
                client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            }
            if let data {
                client?.urlProtocol(self, didLoad: data)
            }
            client?.urlProtocolDidFinishLoading(self)
        }.resume()
    }
}

/// Fails every request, standing in for a device with no connectivity.
private final class FailingURLProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
    }
    override func stopLoading() {}
}

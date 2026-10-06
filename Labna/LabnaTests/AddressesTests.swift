import Foundation
import Testing
@testable import Labna

private final class AddressURLProtocol: URLProtocol, @unchecked Sendable {
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

final class MemorySessionStore: AuthSessionStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var stored: AuthSession?

    init(_ stored: AuthSession? = nil) {
        self.stored = stored
    }

    func load() throws -> AuthSession? {
        lock.lock()
        defer { lock.unlock() }
        return stored
    }

    func save(_ session: AuthSession) throws {
        lock.lock()
        defer { lock.unlock() }
        stored = session
    }

    func clear() throws {
        lock.lock()
        defer { lock.unlock() }
        stored = nil
    }
}

@MainActor
@Suite(.serialized)
struct AddressesTests {
    private func session() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [AddressURLProtocol.self]
        return URLSession(configuration: config)
    }

    private func service(storage: MemorySessionStore? = nil) -> AuthService {
        AuthService(
            baseURL: URL(string: "http://127.0.0.1:3001/api/v1")!,
            session: session(),
            storage: storage ?? MemorySessionStore(activeSession())
        )
    }

    /// The service only reaches the backend with a restored session, exactly
    /// like the app, where `AuthStore.restore()` runs before any account screen.
    private func restoredService(storage: MemorySessionStore? = nil) async throws -> AuthService {
        try await signedInStack(storage: storage).service
    }

    private func signedInStack(storage: MemorySessionStore? = nil) async throws -> (service: AuthService, auth: AuthStore) {
        let service = service(storage: storage)
        AddressURLProtocol.setHandler { request in
            let url = try #require(request.url)
            if url.path.hasSuffix("/customer/me") {
                return json(url: url, body: customerBody())
            }
            return notFound(url: url)
        }
        defer { AddressURLProtocol.setHandler(nil) }
        let auth = AuthStore(service: service)
        await auth.restore()
        if !auth.isAuthenticated {
            Issue.record("Expected an authenticated customer")
        }
        return (service, auth)
    }

    // MARK: - Service

    @Test func listAddressesSendsSessionTokenAndNeverACustomerID() async throws {
        let service = try await restoredService()
        AddressURLProtocol.setHandler { request in
            let url = try #require(request.url)
            #expect(url.path.hasSuffix("/customer/addresses"))
            #expect(request.httpMethod == "GET")
            #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer access-active")
            return json(url: url, body: addressesBody([home]))
        }
        defer { AddressURLProtocol.setHandler(nil) }

        let addresses = try await service.addresses()
        #expect(addresses.count == 1)
        #expect(addresses.first?.id == "address-1")
        #expect(addresses.first?.isDefault == true)
    }

    @Test func createAddressPostsContractShapeAndOmitsEmptyOptionalFields() async throws {
        let service = try await restoredService()
        AddressURLProtocol.setHandler { request in
            let url = try #require(request.url)
            #expect(request.httpMethod == "POST")
            #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer access-active")
            let body = try #require(bodyData(from: request))
            let object = try #require(JSONSerialization.jsonObject(with: body) as? [String: Any])
            #expect(object["label"] as? String == "Home")
            #expect(object["city"] as? String == "Cairo")
            #expect(object["isDefault"] as? Bool == true)
            #expect(object["recipientName"] == nil)
            #expect(object["phoneNumber"] as? String == "+201012345678")
            // Ownership always comes from the token, never from the payload.
            #expect(object["customerID"] == nil)
            #expect(object["id"] == nil)
            #expect(Set(object.keys) == Set([
                "label", "city", "area", "street", "building",
                "floor", "apartment", "notes", "phoneNumber", "isDefault",
            ]))
            return json(url: url, status: 201, body: addressBody(home))
        }
        defer { AddressURLProtocol.setHandler(nil) }

        let created = try await service.createAddress(validInput())
        #expect(created.id == "address-1")
    }

    @Test func updateAndSetDefaultAndDeleteTargetTheAddressPaths() async throws {
        let service = try await restoredService()
        AddressURLProtocol.setHandler { request in
            let url = try #require(request.url)
            #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer access-active")
            if request.httpMethod == "PATCH" && url.path.hasSuffix("/customer/addresses/address-1") {
                return json(url: url, body: addressBody(home))
            }
            if request.httpMethod == "PATCH" && url.path.hasSuffix("/customer/addresses/address-1/default") {
                return json(url: url, body: addressBody(home))
            }
            if request.httpMethod == "DELETE" && url.path.hasSuffix("/customer/addresses/address-1") {
                return json(url: url, body: #"{"data":{"deleted":true,"addresses":[]},"meta":{"requestID":"r"}}"#)
            }
            return notFound(url: url)
        }
        defer { AddressURLProtocol.setHandler(nil) }

        let updated = try await service.updateAddress(id: "address-1", input: validInput())
        #expect(updated.label == "Home")
        let madeDefault = try await service.setDefaultAddress(id: "address-1")
        #expect(madeDefault.isDefault)
        let remaining = try await service.deleteAddress(id: "address-1")
        #expect(remaining.isEmpty)
    }

    @Test func expiredSessionIsReportedInsteadOfSilentlyDroppingTheRequest() async throws {
        AddressURLProtocol.setHandler { request in
            let url = try #require(request.url)
            if url.path.hasSuffix("/customer/auth/refresh") {
                return errorResponse(url: url, status: 401, code: "UNAUTHORIZED", message: "Expired or reused refresh token")
            }
            return errorResponse(url: url, status: 401, code: "UNAUTHORIZED", message: "Valid customer session required")
        }
        defer { AddressURLProtocol.setHandler(nil) }

        let storage = MemorySessionStore(expiredSession())
        let service = service(storage: storage)
        do {
            _ = try await service.restore()
            Issue.record("Expected an expired session")
        } catch AuthError.expiredSession, AuthError.unauthorized {
            #expect(try storage.load() == nil)
        }
        do {
            _ = try await service.addresses()
            Issue.record("Expected an expired session")
        } catch AuthError.expiredSession, AuthError.unauthorized {
            #expect(try storage.load() == nil)
        }
    }

    @Test func backendFailureIsSurfacedAsAnAuthError() async throws {
        let service = try await restoredService()
        AddressURLProtocol.setHandler { _ in throw URLError(.cannotConnectToHost) }
        defer { AddressURLProtocol.setHandler(nil) }
        do {
            _ = try await service.addresses()
            Issue.record("Expected a network error")
        } catch AuthError.network(let code) {
            #expect(code == .cannotConnectToHost)
        }

        AddressURLProtocol.setHandler { request in
            errorResponse(url: try #require(request.url), status: 422, code: "VALIDATION_ERROR", message: "Invalid input")
        }
        do {
            _ = try await service.createAddress(validInput())
            Issue.record("Expected a validation error")
        } catch AuthError.validation {}
    }

    // MARK: - Form validation

    @Test func validationMirrorsTheContractLimits() {
        var draft = AddressFormDraft()
        #expect(draft.validationErrors()[.label] == "addresses.error.labelRange")
        draft.label = "Home"
        draft.city = "C"
        #expect(draft.validationErrors()[.city] == "addresses.error.cityAreaRange")
        draft.city = "Cairo"
        draft.area = "Maadi"
        draft.street = "Rd"
        #expect(draft.validationErrors()[.street] == "addresses.error.streetRange")
        draft.street = "Road 9"
        draft.building = "12"
        #expect(draft.validationErrors().isEmpty)
        draft.floor = String(repeating: "1", count: 51)
        #expect(draft.validationErrors()[.floor] == "addresses.error.optionalMax")
        draft.floor = ""
        draft.phoneNumber = "01012345678"
        #expect(draft.validationErrors()[.phoneNumber] == "addresses.error.phoneInvalid")
        draft.phoneNumber = "+201012345678"
        draft.recipientName = "D"
        #expect(draft.validationErrors()[.recipientName] == "addresses.error.recipientRange")
        draft.recipientName = "Demo Customer"
        #expect(draft.isValid)
    }

    @Test func validPhoneNumbersFollowTheContractPattern() {
        #expect(AddressFormDraft.isValidPhoneNumber("+201012345678"))
        #expect(AddressFormDraft.isValidPhoneNumber("+12345678"))
        #expect(!AddressFormDraft.isValidPhoneNumber("+012345678"))
        #expect(!AddressFormDraft.isValidPhoneNumber("201012345678"))
        #expect(!AddressFormDraft.isValidPhoneNumber("+2010123456789012"))
        #expect(!AddressFormDraft.isValidPhoneNumber("+20101234567a"))
    }

    @Test func draftTrimsInputAndDropsEmptyOptionalContactFields() {
        var draft = AddressFormDraft(customer: Customer(
            id: "customer-1", name: " Demo Customer ", phoneNumber: " +201012345678 ",
            email: "customer@example.com", addresses: [], createdAt: "2026-01-01T00:00:00.000Z"
        ))
        draft.label = "  Home  "
        draft.city = " Cairo "
        draft.area = "Maadi"
        draft.street = "Road 9"
        draft.building = "12"
        let input = draft.input()
        #expect(input.label == "Home")
        #expect(input.city == "Cairo")
        #expect(input.recipientName == "Demo Customer")
        #expect(input.phoneNumber == "+201012345678")

        draft.recipientName = "   "
        draft.phoneNumber = ""
        let stripped = draft.input()
        #expect(stripped.recipientName == nil)
        #expect(stripped.phoneNumber == nil)
    }

    @Test func draftPrefillsFromAnExistingAddress() {
        let draft = AddressFormDraft(address: home)
        #expect(draft.label == "Home")
        #expect(draft.city == "Cairo")
        #expect(draft.isDefault)
        #expect(draft.recipientName == "Demo Customer")
        #expect(draft.phoneNumber == "+201012345678")
    }

    // MARK: - Store

    @Test func loadPublishesAddressesToTheSignedInCustomer() async throws {
        let (service, authStore) = try await signedInStack()
        let store = AddressesStore(service: service, auth: authStore)
        stubList([home])
        defer { AddressURLProtocol.setHandler(nil) }

        await store.load()
        #expect(store.phase == .loaded)
        #expect(store.addresses.map(\.id) == ["address-1"])
        guard case .authenticated(let customer) = authStore.state else {
            Issue.record("Expected an authenticated customer")
            return
        }
        #expect(customer.addresses.map(\.id) == ["address-1"])
    }

    @Test func addKeepsASingleDefaultAndAnnouncesSuccess() async throws {
        let (service, authStore) = try await signedInStack()
        let store = AddressesStore(service: service, auth: authStore)
        stubList([home])
        await store.load()

        AddressURLProtocol.setHandler { request in
            let url = try #require(request.url)
            #expect(request.httpMethod == "POST")
            // The API answers with only the created address, marked default.
            return json(url: url, status: 201, body: addressBody(officeDefault))
        }
        defer { AddressURLProtocol.setHandler(nil) }

        var draft = AddressFormDraft(customer: nil)
        draft.label = "Office"
        draft.city = "Cairo"
        draft.area = "Maadi"
        draft.street = "Road 9"
        draft.building = "12"
        draft.isDefault = true

        #expect(await store.add(draft.input()))
        #expect(store.addresses.map(\.id) == ["address-1", "address-2"])
        #expect(store.addresses.filter(\.isDefault).map(\.id) == ["address-2"])
        #expect(store.notice == "addresses.saved")
        #expect(store.mutation == nil)
        #expect(store.lastError == nil)
    }

    @Test func deleteTakesTheNormalizedListFromTheServer() async throws {
        let (service, authStore) = try await signedInStack()
        let store = AddressesStore(service: service, auth: authStore)
        stubList([home, officeDefault])
        await store.load()
        #expect(store.addresses.count == 2)

        AddressURLProtocol.setHandler { request in
            let url = try #require(request.url)
            #expect(request.httpMethod == "DELETE")
            return json(url: url, body: #"{"data":{"deleted":true,"addresses":[{"id":"address-2","label":"Office","city":"Cairo","area":"Maadi","street":"Road 9","building":"12","floor":"3","apartment":"","notes":"","recipientName":"Demo Customer","phoneNumber":"+201012345678","isDefault":true}]},"meta":{"requestID":"r"}}"#)
        }
        defer { AddressURLProtocol.setHandler(nil) }

        #expect(await store.delete(id: "address-1"))
        #expect(store.addresses.map(\.id) == ["address-2"])
        #expect(store.addresses.first?.isDefault == true)
        #expect(store.notice == "addresses.deleted")
        #expect(store.mutation == nil)
    }

    @Test func setDefaultClearsTheFlagOnEveryOtherAddress() async throws {
        let (service, authStore) = try await signedInStack()
        let store = AddressesStore(service: service, auth: authStore)
        stubList([home, officeDefault])
        await store.load()

        AddressURLProtocol.setHandler { request in
            let url = try #require(request.url)
            #expect(request.httpMethod == "PATCH")
            #expect(url.path.hasSuffix("/customer/addresses/address-2/default"))
            return json(url: url, body: addressBody(officeDefault))
        }
        defer { AddressURLProtocol.setHandler(nil) }

        #expect(await store.setDefault(id: "address-2"))
        #expect(store.addresses.filter(\.isDefault).map(\.id) == ["address-2"])
        #expect(store.notice == "addresses.defaultUpdated")
    }

    @Test func mutationProgressIsVisibleWhileSavingAndClearedAfterwards() async throws {
        let (service, authStore) = try await signedInStack()
        let store = AddressesStore(service: service, auth: authStore)
        stubList([home])
        await store.load()

        AddressURLProtocol.setHandler { request in
            let url = try #require(request.url)
            if request.httpMethod == "POST" {
                Thread.sleep(forTimeInterval: 0.4)
                return json(url: url, status: 201, body: addressBody(home))
            }
            return json(url: url, body: addressesBody([home]))
        }
        defer { AddressURLProtocol.setHandler(nil) }

        let task = Task { await store.add(validInput()) }
        var sawProgress = false
        for _ in 0..<300 {
            if store.mutation == .save {
                sawProgress = true
                break
            }
            try await Task.sleep(for: .milliseconds(5))
        }
        #expect(await task.value)
        #expect(sawProgress)
        #expect(store.mutation == nil)
    }

    @Test func failedRefreshKeepsTheAddressesAlreadyOnScreen() async throws {
        let (service, authStore) = try await signedInStack()
        let store = AddressesStore(service: service, auth: authStore)
        stubList([home])
        await store.load()

        AddressURLProtocol.setHandler { _ in throw URLError(.notConnectedToInternet) }
        defer { AddressURLProtocol.setHandler(nil) }

        await store.load()
        #expect(store.addresses.count == 1)
        #expect(store.phase == .loaded)
        #expect(store.lastError == .network(.notConnectedToInternet))
    }

    @Test func rejectedSessionEndsTheSessionOnTheAccountStore() async throws {
        let storage = MemorySessionStore(activeSession())
        AddressURLProtocol.setHandler { request in
            let url = try #require(request.url)
            if url.path.hasSuffix("/customer/me") {
                return json(url: url, body: customerBody())
            }
            if url.path.hasSuffix("/customer/auth/refresh") {
                return errorResponse(url: url, status: 401, code: "UNAUTHORIZED", message: "Expired or reused refresh token")
            }
            return errorResponse(url: url, status: 401, code: "UNAUTHORIZED", message: "Valid customer session required")
        }
        defer { AddressURLProtocol.setHandler(nil) }

        let service = service(storage: storage)
        let authStore = AuthStore(service: service)
        await authStore.restore()
        #expect(authStore.isAuthenticated)

        let store = AddressesStore(service: service, auth: authStore)
        await store.load()
        #expect(store.lastError == .unauthorized)
        #expect(authStore.state == .guest)
    }

    // MARK: - Helpers

    private func stubList(_ addresses: [CustomerAddress]) {
        AddressURLProtocol.setHandler { request in
            let url = try #require(request.url)
            if request.httpMethod == "GET" {
                return json(url: url, body: addressesBody(addresses))
            }
            return notFound(url: url)
        }
    }

    private func validInput() -> CustomerAddressInput {
        CustomerAddressInput(
            label: "Home", city: "Cairo", area: "Maadi", street: "Road 9", building: "12",
            floor: "3", apartment: "5", notes: "", recipientName: nil,
            phoneNumber: "+201012345678", isDefault: true
        )
    }

    private var home: CustomerAddress {
        CustomerAddress(
            id: "address-1", label: "Home", city: "Cairo", area: "Maadi", street: "Road 9",
            building: "12", floor: "3", apartment: "5", notes: "",
            recipientName: "Demo Customer", phoneNumber: "+201012345678", isDefault: true
        )
    }

    private var officeDefault: CustomerAddress {
        CustomerAddress(
            id: "address-2", label: "Office", city: "Cairo", area: "Maadi", street: "Road 9",
            building: "12", floor: "3", apartment: "", notes: "",
            recipientName: "Demo Customer", phoneNumber: "+201012345678", isDefault: true
        )
    }

    private func activeSession() -> AuthSession {
        AuthSession(
            accessToken: "access-active",
            accessTokenExpiresAt: Date().addingTimeInterval(600),
            refreshCookie: "refresh-active",
            customer: Customer(
                id: "customer-1", name: "Demo Customer", phoneNumber: "+201012345678",
                email: "customer@example.com", addresses: [], createdAt: "2026-01-01T00:00:00.000Z"
            )
        )
    }

    private func expiredSession() -> AuthSession {
        AuthSession(
            accessToken: "expired",
            accessTokenExpiresAt: Date().addingTimeInterval(-60),
            refreshCookie: "expired",
            customer: Customer(
                id: "customer-1", name: "Demo Customer", phoneNumber: "+201012345678",
                email: "customer@example.com", addresses: [], createdAt: "2026-01-01T00:00:00.000Z"
            )
        )
    }
}

private func addressesBody(_ addresses: [CustomerAddress]) -> String {
    let encoded = (try? JSONEncoder().encode(addresses)).flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
    return "{\"data\":\(encoded),\"meta\":{\"requestID\":\"r\"}}"
}

/// Single-address responses, matching `respond(res, address)` in the API.
private func addressBody(_ address: CustomerAddress) -> String {
    let encoded = (try? JSONEncoder().encode(address)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    return "{\"data\":\(encoded),\"meta\":{\"requestID\":\"r\"}}"
}

private func customerBody() -> String {
    #"{"data":{"id":"customer-1","name":"Demo Customer","phoneNumber":"+201012345678","email":"customer@example.com","addresses":[],"createdAt":"2026-01-01T00:00:00.000Z"},"meta":{"requestID":"r"}}"#
}

private func errorResponse(url: URL, status: Int, code: String, message: String) -> (URLResponse, Data) {
    json(url: url, status: status, body: "{\"error\":{\"code\":\"\(code)\",\"message\":\"\(message)\"},\"meta\":{\"requestID\":\"r\"}}")
}

private func notFound(url: URL) -> (URLResponse, Data) {
    errorResponse(url: url, status: 404, code: "NOT_FOUND", message: "Not found")
}

private func json(url: URL, status: Int = 200, body: String) -> (URLResponse, Data) {
    (HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!, Data(body.utf8))
}

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

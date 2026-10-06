import Foundation

actor AuthService {
    private let baseURL: URL
    private let session: URLSession
    private let storage: any AuthSessionStoring
    private let cookieStorage: HTTPCookieStorage?
    private var currentSession: AuthSession?
    private var refreshTask: Task<AuthSession, Error>?
    private let refreshCookieName = "labna_customer_refresh"

    init(
        baseURL: URL,
        session: URLSession = .shared,
        storage: any AuthSessionStoring = KeychainAuthSessionStore(),
        cookieStorage: HTTPCookieStorage? = nil
    ) {
        self.baseURL = baseURL
        self.session = session
        self.storage = storage
        self.cookieStorage = cookieStorage ?? session.configuration.httpCookieStorage ?? .shared
    }

    /// The backend's CSRF guard rejects any `/customer/auth/*` request that
    /// carries the refresh cookie without an allow-listed `Origin`
    /// (`customer-auth.ts` in the API). Browsers send `Origin` automatically, so
    /// the storefront never hits this, but `URLSession` does not — which would
    /// make refresh and logout fail with `403 INVALID_ORIGIN` on a native client.
    ///
    /// The refresh token is kept in the Keychain and replayed by hand, so the
    /// cookie jar is disabled on this session: that keeps a stale cookie from
    /// being attached behind our back, and lets `Origin` be the single source of
    /// the cookie-authenticated request.
    private static func makeAuthSession() -> URLSession {
        let configuration = URLSessionConfiguration.default
        configuration.httpShouldSetCookies = false
        configuration.httpCookieAcceptPolicy = .never
        configuration.httpCookieStorage = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: configuration)
    }

    /// The session used for the cookie-authenticated auth endpoints.
    ///
    /// Defaults to a cookie-less session so the refresh token only ever travels
    /// when we attach it explicitly alongside `Origin`.
    static func defaultSession() -> URLSession { makeAuthSession() }

    func restore() async throws -> Customer? {
        currentSession = try storage.load()
        guard currentSession != nil else { return nil }
        do {
            if currentSession?.hasUsableAccessToken != true {
                _ = try await refreshSession()
            }
            return try await me()
        } catch AuthError.unauthorized, AuthError.expiredSession {
            try? storage.clear()
            currentSession = nil
            throw AuthError.expiredSession
        } catch {
            return currentSession?.customer
        }
    }

    func login(email: String, password: String) async throws -> Customer {
        let input = AuthCredentials(email: email, password: password)
        let response: CustomerAuthResponse = try await sendAuth(path: "customer/auth/login", body: input)
        let stored = try makeSession(from: response)
        currentSession = stored
        try storage.save(stored)
        return response.customer
    }

    func register(name: String, phoneNumber: String, email: String, password: String) async throws -> Customer {
        let input = RegisterCustomerInput(name: name, phoneNumber: phoneNumber, email: email, password: password)
        let response: CustomerAuthResponse = try await sendAuth(path: "customer/auth/register", body: input)
        let stored = try makeSession(from: response)
        currentSession = stored
        try storage.save(stored)
        return response.customer
    }

    func logout() async {
        _ = try? await logoutWithResult()
    }

    /// Revokes the session server-side, then always clears local state.
    ///
    /// Sent directly rather than through `authorizedRequest`: the endpoint
    /// identifies the session from the access token, and the cookie has to
    /// travel with an `Origin` to clear the API's CSRF guard.
    private func logoutWithResult() async throws -> LogoutResponse? {
        defer {
            try? storage.clear()
            currentSession = nil
        }
        guard let session = currentSession else { return nil }
        return try await sendAuth(
            path: "customer/auth/logout",
            body: Optional<String>.none,
            refreshCookie: session.refreshCookie,
            accessToken: session.accessToken
        )
    }

    func me() async throws -> Customer {
        let customer = try await authorizedRequest(path: "customer/me", method: "GET", decode: Customer.self)
        try updateStoredCustomer(customer)
        return customer
    }

    func updateProfile(name: String, phoneNumber: String, email: String) async throws -> Customer {
        let input = CustomerProfilePatch(name: name, phoneNumber: phoneNumber, email: email)
        let customer = try await authorizedRequest(path: "customer/me", method: "PATCH", body: input, decode: Customer.self)
        try updateStoredCustomer(customer)
        return customer
    }

    func changePassword(currentPassword: String, newPassword: String) async throws {
        let input = CustomerPasswordPatch(currentPassword: currentPassword, newPassword: newPassword)
        let response = try await authorizedRequest(path: "customer/me/password", method: "PATCH", body: input, decode: PasswordChangedResponse.self)
        guard response.passwordChanged else { throw AuthError.invalidResponse }
        try? storage.clear()
        currentSession = nil
    }

    /// Clears the persisted session.
    ///
    /// `nonisolated` so a launch-time reset can run before anything awaits this
    /// actor. That is safe because `currentSession` is still `nil` during app
    /// start-up; callers that already hold a live session should use
    /// `logout()` instead so the API is told as well.
    nonisolated func discardPersistedSession() {
        try? storage.clear()
    }

    func validAccessToken() async throws -> String {
        guard let existing = currentSession else { throw AuthError.expiredSession }
        if existing.hasUsableAccessToken { return existing.accessToken }
        return try await refreshSession().accessToken
    }

    // MARK: - Saved addresses

    func addresses() async throws -> [CustomerAddress] {
        try await authorizedRequest(path: "customer/addresses", decode: [CustomerAddress].self)
    }

    func createAddress(_ input: CustomerAddressInput) async throws -> CustomerAddress {
        try await authorizedRequest(path: "customer/addresses", method: "POST", body: input, decode: CustomerAddress.self)
    }

    func updateAddress(id: String, input: CustomerAddressInput) async throws -> CustomerAddress {
        try await authorizedRequest(path: addressPath(id), method: "PATCH", body: input, decode: CustomerAddress.self)
    }

    func setDefaultAddress(id: String) async throws -> CustomerAddress {
        try await authorizedRequest(path: "\(addressPath(id))/default", method: "PATCH", decode: CustomerAddress.self)
    }

    func deleteAddress(id: String) async throws -> [CustomerAddress] {
        struct DeletedAddresses: Decodable {
            let deleted: Bool
            let addresses: [CustomerAddress]
        }
        let response: DeletedAddresses = try await authorizedRequest(path: addressPath(id), method: "DELETE", decode: DeletedAddresses.self)
        return response.addresses
    }

    // MARK: - Test seams

    /// Exposes the internal refresh so tests can assert on the headers it sends
    /// without going through a full restore cycle.
    func refreshForTesting() async throws -> AuthSession {
        currentSession = try storage.load()
        return try await refreshSession()
    }

    /// Exposes the logout request so its headers can be asserted directly.
    func logoutForTesting() async throws {
        try await logoutWithResult()
    }

    // MARK: - Orders

    /// Creates a real order through `POST /orders`.
    ///
    /// The request is sent with the session's Bearer token, which is how the API
    /// links the order to the signed-in customer. Ownership is therefore never
    /// asserted by the client, and a guest session still gets an order without
    /// a customer history entry.
    func createOrder(_ request: CheckoutRequest) async throws -> PlacedOrder {
        try await authorizedRequest(path: "orders", method: "POST", body: request, decode: PlacedOrder.self)
    }

    /// Reads a single order back from the API, e.g. after a relaunch.
    func order(id: String) async throws -> PlacedOrder {
        try await authorizedRequest(path: "orders/\(id)", decode: PlacedOrder.self)
    }

    /// The signed-in customer's own orders, newest first, one cursor page at a
    /// time. The API scopes the query to the token's customer, so the app never
    /// sends an ownership identifier.
    func customerOrders(cursor: String? = nil, limit: Int = OrderPage.defaultLimit) async throws -> OrderPage {
        var queryItems = [URLQueryItem(name: "limit", value: String(limit))]
        if let cursor { queryItems.append(URLQueryItem(name: "cursor", value: cursor)) }
        let page: CustomerOrderPageDTO = try await authorizedRawRequest(
            path: "customer/orders",
            queryItems: queryItems,
            decode: CustomerOrderPageDTO.self
        )
        return OrderPage(items: page.data, nextCursor: page.meta.nextCursor)
    }

    /// One of the signed-in customer's orders, by internal id or order number.
    func customerOrder(id: String) async throws -> PlacedOrder {
        let escaped = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        return try await authorizedRequest(path: "customer/orders/\(escaped)", decode: PlacedOrder.self)
    }

    private func addressPath(_ id: String) -> String {
        let escaped = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        return "customer/addresses/\(escaped)"
    }

    func authorizedRequest<T: Decodable>(
        path: String,
        method: String = "GET",
        queryItems: [URLQueryItem] = [],
        decode type: T.Type
    ) async throws -> T {
        do {
            let token = try await validAccessToken()
            return try await request(path: path, method: method, accessToken: token, queryItems: queryItems, decode: type)
        } catch AuthError.unauthorized, AuthError.expiredSession {
            let token = try await refreshSession().accessToken
            return try await request(path: path, method: method, accessToken: token, queryItems: queryItems, decode: type)
        }
    }

    func authorizedRequest<Body: Encodable, T: Decodable>(path: String, method: String, body: Body, decode type: T.Type) async throws -> T {
        do {
            let token = try await validAccessToken()
            return try await request(path: path, method: method, accessToken: token, body: body, decode: type)
        } catch AuthError.unauthorized, AuthError.expiredSession {
            let token = try await refreshSession().accessToken
            return try await request(path: path, method: method, accessToken: token, body: body, decode: type)
        }
    }

    private func refreshSession() async throws -> AuthSession {
        if let refreshTask { return try await refreshTask.value }
        let task = Task<AuthSession, Error> { try await self.refreshSessionNow() }
        refreshTask = task
        defer { refreshTask = nil }
        do {
            return try await task.value
        } catch {
            // Only a definitive rejection ends the session. A transport failure
            // says nothing about whether the server still considers the refresh
            // token valid, and it stays valid for 30 days, so wiping the
            // Keychain copy here would sign the user out for being offline.
            if (error as? AuthError)?.terminatesSession == true {
                try? storage.clear()
                currentSession = nil
            }
            throw error
        }
    }

    private func refreshSessionNow() async throws -> AuthSession {
        guard let previous = currentSession else { throw AuthError.expiredSession }
        let response: CustomerAuthResponse = try await sendAuth(path: "customer/auth/refresh", body: Optional<String>.none, refreshCookie: previous.refreshCookie)
        let next = try makeSession(from: response)
        currentSession = next
        try storage.save(next)
        return next
    }

    private func sendAuth<Body: Encodable, T: Decodable>(
        path: String,
        body: Body,
        refreshCookie: String? = nil,
        accessToken: String? = nil
    ) async throws -> T {
        try Task.checkCancellation()
        var request = try makeRequest(path: path, method: "POST")
        if let accessToken {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        if let refreshCookie {
            request.setValue("\(refreshCookieName)=\(refreshCookie)", forHTTPHeaderField: "Cookie")
            // Required by the API's CSRF guard whenever the refresh cookie is
            // present. Without it the backend answers 403 INVALID_ORIGIN and
            // refresh can never succeed from a native client.
            request.setValue(AppConfiguration.customerAuthOrigin, forHTTPHeaderField: "Origin")
        }
        if Body.self != Optional<String>.self {
            request.httpBody = try JSONEncoder().encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return try await perform(request)
    }

    private func request<T: Decodable>(
        path: String,
        method: String,
        accessToken: String,
        queryItems: [URLQueryItem] = [],
        decode type: T.Type
    ) async throws -> T {
        var request = try makeRequest(path: path, method: method, queryItems: queryItems)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        return try await perform(request)
    }

    private func request<Body: Encodable, T: Decodable>(path: String, method: String, accessToken: String, body: Body, decode type: T.Type) async throws -> T {
        var request = try makeRequest(path: path, method: method)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        return try await perform(request)
    }

    /// Like `authorizedRequest`, but decodes the whole response body.
    ///
    /// List routes answer `{"data": [...], "meta": {...}}`, so their payload is
    /// not wrapped in the single-resource envelope.
    func authorizedRawRequest<T: Decodable>(
        path: String,
        queryItems: [URLQueryItem] = [],
        decode type: T.Type
    ) async throws -> T {
        do {
            let token = try await validAccessToken()
            return try await rawRequest(path: path, accessToken: token, queryItems: queryItems, decode: type)
        } catch AuthError.unauthorized, AuthError.expiredSession {
            let token = try await refreshSession().accessToken
            return try await rawRequest(path: path, accessToken: token, queryItems: queryItems, decode: type)
        }
    }

    private func rawRequest<T: Decodable>(
        path: String,
        accessToken: String,
        queryItems: [URLQueryItem],
        decode type: T.Type
    ) async throws -> T {
        var request = try makeRequest(path: path, method: "GET", queryItems: queryItems)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        return try await performRaw(request)
    }

    private func perform<T: Decodable>(_ request: URLRequest) async throws -> T {
        do {
            let (data, response) = try await session.data(for: request)
            try Task.checkCancellation()
            guard let http = response as? HTTPURLResponse else { throw AuthError.invalidResponse }
            guard (200..<300).contains(http.statusCode) else { throw mapHTTPError(status: http.statusCode, data: data) }
            rememberRefreshCookie(from: http)
            return try OrderTimestamp.decoder.decode(APIEnvelope<T>.self, from: data).data
        } catch let error as AuthError {
            throw error
        } catch let error as URLError {
            throw AuthError.network(error.code)
        } catch {
            throw AuthError.invalidData
        }
    }

    private func performRaw<T: Decodable>(_ request: URLRequest) async throws -> T {
        do {
            let (data, response) = try await session.data(for: request)
            try Task.checkCancellation()
            guard let http = response as? HTTPURLResponse else { throw AuthError.invalidResponse }
            guard (200..<300).contains(http.statusCode) else { throw mapHTTPError(status: http.statusCode, data: data) }
            rememberRefreshCookie(from: http)
            return try OrderTimestamp.decoder.decode(T.self, from: data)
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as AuthError {
            throw error
        } catch let error as URLError {
            if error.code == .cancelled { throw CancellationError() }
            throw AuthError.network(error.code)
        } catch {
            throw AuthError.invalidData
        }
    }

    private func makeRequest(path: String, method: String, queryItems: [URLQueryItem] = []) throws -> URLRequest {
        guard baseURL.isAllowedCatalogAPIBaseURL, baseURL.query == nil, baseURL.fragment == nil else { throw AuthError.invalidBaseURL }
        var url = baseURL.appendingPathComponent(path)
        if !queryItems.isEmpty {
            guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
                throw AuthError.invalidBaseURL
            }
            components.queryItems = queryItems
            guard let resolved = components.url else { throw AuthError.invalidBaseURL }
            url = resolved
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    private func makeSession(from response: CustomerAuthResponse) throws -> AuthSession {
        guard let refreshCookie = pendingRefreshCookie ?? storedRefreshCookie() ?? currentSession?.refreshCookie else { throw AuthError.invalidResponse }
        pendingRefreshCookie = nil
        return AuthSession(
            accessToken: response.accessToken,
            accessTokenExpiresAt: Date().addingTimeInterval(TimeInterval(response.expiresIn)),
            refreshCookie: refreshCookie,
            customer: response.customer
        )
    }

    private func updateStoredCustomer(_ customer: Customer) throws {
        guard let session = currentSession else { return }
        let updated = AuthSession(accessToken: session.accessToken, accessTokenExpiresAt: session.accessTokenExpiresAt, refreshCookie: session.refreshCookie, customer: customer)
        currentSession = updated
        try storage.save(updated)
    }

    private var pendingRefreshCookie: String?

    /// Captures the refresh cookie the API issues on login, register and refresh.
    ///
    /// The header is read first because it is authoritative, and the parsed jar
    /// is only a fallback for the case where `URLSession` has already consumed
    /// it. Splitting is done on the cookie's own `;` separators rather than on
    /// commas, because `Expires=Wed, 09 Jun 2027 …` legitimately contains them.
    private func rememberRefreshCookie(from response: HTTPURLResponse) {
        let headers = response.allHeaderFields
        let values = headers.compactMap { key, value -> String? in
            guard String(describing: key).caseInsensitiveCompare("Set-Cookie") == .orderedSame else { return nil }
            return String(describing: value)
        }
        for header in values {
            for field in header.components(separatedBy: ";") {
                let trimmed = field.trimmingCharacters(in: .whitespacesAndNewlines)
                guard trimmed.hasPrefix("\(refreshCookieName)=") else { continue }
                let value = String(trimmed.dropFirst(refreshCookieName.count + 1))
                if !value.isEmpty { pendingRefreshCookie = value }
            }
        }
    }

    /// Reads a refresh cookie the `URLSession` already parsed.
    ///
    /// The lookup is scoped to this API's own host on purpose: scanning the whole
    /// jar would accept a same-named cookie belonging to an unrelated site.
    private func storedRefreshCookie() -> String? {
        guard let cookieStorage, let host = baseURL.host else { return nil }
        return cookieStorage.cookies?.first { cookie in
            cookie.name == refreshCookieName
                && cookie.domain == host
                && cookie.path.hasPrefix("/api/v1/customer/auth")
        }?.value
    }

    private func mapHTTPError(status: Int, data: Data) -> AuthError {
        let decoded = try? JSONDecoder().decode(APIErrorEnvelope.self, from: data)
        switch decoded?.error.code {
        case "INVALID_CREDENTIALS": return .invalidCredentials
        case "INVALID_CURRENT_PASSWORD": return .invalidCurrentPassword
        case "DUPLICATE_RESOURCE": return .duplicateAccount
        case "PASSWORD_REUSE": return .passwordReuse
        case "VALIDATION_ERROR": return .validation(decoded?.error.message ?? "Invalid input")
        case "UNAUTHORIZED": return .unauthorized
        case "PRODUCT_UNAVAILABLE": return .checkout(.productUnavailable(productID: decoded?.error.details?.productID))
        case "VARIANT_UNAVAILABLE": return .checkout(.variantUnavailable(
            productID: decoded?.error.details?.productID,
            variantID: decoded?.error.details?.variantID
        ))
        case "INSUFFICIENT_STOCK": return .checkout(.insufficientStock(
            productID: decoded?.error.details?.productID,
            variantID: decoded?.error.details?.variantID,
            availableQuantity: decoded?.error.details?.availableQuantity
        ))
        case "INVALID_BRANCH": return .checkout(.invalidBranch)
        case "NO_PICKUP_BRANCH": return .checkout(.noPickupBranch)
        case "PAYMENT_FAILED": return .checkout(.paymentFailed)
        default: return .httpStatus(status, decoded?.error.message)
        }
    }
}

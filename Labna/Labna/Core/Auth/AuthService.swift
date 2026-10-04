import Foundation

actor AuthService {
    private let baseURL: URL
    private let session: URLSession
    private let storage: any AuthSessionStoring
    private var currentSession: AuthSession?
    private var refreshTask: Task<AuthSession, Error>?
    private let refreshCookieName = "labna_customer_refresh"

    init(baseURL: URL, session: URLSession = .shared, storage: any AuthSessionStoring = KeychainAuthSessionStore()) {
        self.baseURL = baseURL
        self.session = session
        self.storage = storage
    }

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
        defer {
            try? storage.clear()
            currentSession = nil
        }
        guard currentSession != nil else { return }
        do {
            _ = try await authorizedRequest(path: "customer/auth/logout", method: "POST", decode: LogoutResponse.self)
        } catch {}
    }

    func me() async throws -> Customer {
        try await authorizedRequest(path: "customer/me", method: "GET", decode: Customer.self)
    }

    func validAccessToken() async throws -> String {
        guard let existing = currentSession else { throw AuthError.expiredSession }
        if existing.hasUsableAccessToken { return existing.accessToken }
        return try await refreshSession().accessToken
    }

    func authorizedRequest<T: Decodable>(path: String, method: String = "GET", decode type: T.Type) async throws -> T {
        do {
            let token = try await validAccessToken()
            return try await request(path: path, method: method, accessToken: token, decode: type)
        } catch AuthError.unauthorized, AuthError.expiredSession {
            let token = try await refreshSession().accessToken
            return try await request(path: path, method: method, accessToken: token, decode: type)
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
            try? storage.clear()
            currentSession = nil
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

    private func sendAuth<Body: Encodable, T: Decodable>(path: String, body: Body, refreshCookie: String? = nil) async throws -> T {
        try Task.checkCancellation()
        var request = try makeRequest(path: path, method: "POST")
        if let refreshCookie {
            request.setValue("\(refreshCookieName)=\(refreshCookie)", forHTTPHeaderField: "Cookie")
        }
        if Body.self != Optional<String>.self {
            request.httpBody = try JSONEncoder().encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return try await perform(request)
    }

    private func request<T: Decodable>(path: String, method: String, accessToken: String, decode type: T.Type) async throws -> T {
        var request = try makeRequest(path: path, method: method)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        return try await perform(request)
    }

    private func perform<T: Decodable>(_ request: URLRequest) async throws -> T {
        do {
            let (data, response) = try await session.data(for: request)
            try Task.checkCancellation()
            guard let http = response as? HTTPURLResponse else { throw AuthError.invalidResponse }
            guard (200..<300).contains(http.statusCode) else { throw mapHTTPError(status: http.statusCode, data: data) }
            rememberRefreshCookie(from: http)
            return try JSONDecoder().decode(APIEnvelope<T>.self, from: data).data
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

    private func makeRequest(path: String, method: String) throws -> URLRequest {
        guard baseURL.isAllowedCatalogAPIBaseURL, baseURL.query == nil, baseURL.fragment == nil else { throw AuthError.invalidBaseURL }
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    private func makeSession(from response: CustomerAuthResponse) throws -> AuthSession {
        guard let refreshCookie = pendingRefreshCookie ?? currentSession?.refreshCookie else { throw AuthError.invalidResponse }
        pendingRefreshCookie = nil
        return AuthSession(
            accessToken: response.accessToken,
            accessTokenExpiresAt: Date().addingTimeInterval(TimeInterval(response.expiresIn)),
            refreshCookie: refreshCookie,
            customer: response.customer
        )
    }

    private var pendingRefreshCookie: String?

    private func rememberRefreshCookie(from response: HTTPURLResponse) {
        let headers = response.allHeaderFields
        let values = headers.compactMap { key, value -> String? in
            guard String(describing: key).caseInsensitiveCompare("Set-Cookie") == .orderedSame else { return nil }
            return String(describing: value)
        }
        for header in values {
            for cookie in header.components(separatedBy: ",") {
                let trimmed = cookie.trimmingCharacters(in: .whitespacesAndNewlines)
                guard trimmed.hasPrefix("\(refreshCookieName)=") else { continue }
                let value = trimmed.dropFirst(refreshCookieName.count + 1).split(separator: ";", maxSplits: 1).first.map(String.init) ?? ""
                if !value.isEmpty { pendingRefreshCookie = value }
            }
        }
    }

    private func mapHTTPError(status: Int, data: Data) -> AuthError {
        let decoded = try? JSONDecoder().decode(APIErrorEnvelope.self, from: data)
        switch decoded?.error.code {
        case "INVALID_CREDENTIALS": return .invalidCredentials
        case "DUPLICATE_RESOURCE": return .duplicateAccount
        case "VALIDATION_ERROR": return .validation(decoded?.error.message ?? "Invalid input")
        case "UNAUTHORIZED": return .unauthorized
        default: return .httpStatus(status, decoded?.error.message)
        }
    }
}

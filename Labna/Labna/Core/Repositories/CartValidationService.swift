import Foundation
import SwiftUI

enum CartValidationError: Error, Equatable {
    case invalidBaseURL
    case invalidResponse
    case invalidData
    case httpStatus(Int)
    case noPickupBranch
    case network(URLError.Code)

    var messageKey: LocalizedStringKey {
        switch self {
        case .network(.notConnectedToInternet): "data.error.offline"
        case .network(.timedOut): "data.error.timeout"
        case .invalidData, .invalidResponse: "data.error.invalid"
        case .invalidBaseURL: "data.error.configuration"
        case .noPickupBranch: "cart.validation.noPickupBranch"
        case .httpStatus, .network: "data.error.general"
        }
    }

    var isOffline: Bool {
        switch self {
        case .network(.notConnectedToInternet), .network(.networkConnectionLost), .network(.cannotFindHost), .network(.cannotConnectToHost):
            true
        default:
            false
        }
    }
}

/// Thin client for `POST /cart/validate`.
///
/// The endpoint is public, so this deliberately carries no auth token: the cart
/// belongs to the device, not to a customer session. All inventory and pricing
/// rules stay on the server; this type only moves identifiers and quantities in
/// and rendered results out.
struct CartValidationService: Sendable {
    private let baseURL: URL
    private let session: URLSession

    init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func validate(items: [CartItem], branchID: String? = nil) async throws -> CartValidationResult {
        try Task.checkCancellation()
        guard baseURL.isAllowedCatalogAPIBaseURL, baseURL.query == nil, baseURL.fragment == nil else {
            throw CartValidationError.invalidBaseURL
        }
        var request = URLRequest(url: baseURL.appendingPathComponent("cart/validate"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(CartValidationRequest(items: items, branchID: branchID))
        request.timeoutInterval = 30

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as URLError {
            if error.code == .cancelled { throw CancellationError() }
            throw CartValidationError.network(error.code)
        }
        try Task.checkCancellation()

        guard let http = response as? HTTPURLResponse else { throw CartValidationError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw mapHTTPError(status: http.statusCode, data: data)
        }
        do {
            return try JSONDecoder().decode(APIEnvelope<CartValidationResult>.self, from: data).data
        } catch {
            throw CartValidationError.invalidData
        }
    }

    private func mapHTTPError(status: Int, data: Data) -> CartValidationError {
        let decoded = try? JSONDecoder().decode(APIErrorEnvelope.self, from: data)
        if decoded?.error.code == "NO_PICKUP_BRANCH" { return .noPickupBranch }
        return .httpStatus(status)
    }
}
import Foundation
import SwiftUI

enum CatalogError: Error, Equatable {
    case missingResource(CatalogResource)
    case unreadableResource(CatalogResource)
    case invalidData(CatalogResource)
    case invalidBaseURL
    case invalidResponse
    case httpStatus(Int)
    case network(URLError.Code)
    case unexpected

    /// Backend error codes that mean something more specific than "the request
    /// failed". Any other code stays a plain status so an unexpected backend
    /// error can never invent meaning it did not report.
    case noPickupBranch
    case invalidBranch

    var messageKey: LocalizedStringKey {
        switch self {
        case .network(.notConnectedToInternet): "data.error.offline"
        case .network(.timedOut): "data.error.timeout"
        case .invalidData, .invalidResponse: "data.error.invalid"
        case .missingResource, .unreadableResource, .invalidBaseURL: "data.error.configuration"
        case .noPickupBranch: "catalog.error.noPickupBranch"
        case .invalidBranch: "catalog.error.invalidBranch"
        case .httpStatus, .network, .unexpected: "data.error.general"
        }
    }

    /// Maps the backend's `{ error: { code } }` envelope onto a case, keeping
    /// the status so the UI can still show something precise if needed.
    static func fromServerCode(_ code: String?, status: Int) -> CatalogError {
        switch code {
        case "NO_PICKUP_BRANCH": .noPickupBranch
        case "INVALID_BRANCH": .invalidBranch
        default: .httpStatus(status)
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

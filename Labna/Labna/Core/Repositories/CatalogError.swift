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

    var messageKey: LocalizedStringKey {
        switch self {
        case .network(.notConnectedToInternet): "data.error.offline"
        case .network(.timedOut): "data.error.timeout"
        case .invalidData, .invalidResponse: "data.error.invalid"
        case .missingResource, .unreadableResource, .invalidBaseURL: "data.error.configuration"
        case .httpStatus, .network, .unexpected: "data.error.general"
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

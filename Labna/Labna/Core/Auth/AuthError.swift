import Foundation

enum AuthError: Error, Equatable, Sendable {
    case invalidCredentials
    case duplicateAccount
    case validation(String)
    case expiredSession
    case unauthorized
    case network(URLError.Code)
    case httpStatus(Int, String?)
    case invalidResponse
    case invalidData
    case invalidBaseURL

    var messageKey: String {
        switch self {
        case .invalidCredentials: "auth.error.invalidCredentials"
        case .duplicateAccount: "auth.error.duplicateAccount"
        case .validation: "auth.error.validation"
        case .expiredSession: "auth.error.expiredSession"
        case .unauthorized: "auth.error.unauthorized"
        case .network: "auth.error.network"
        case .httpStatus, .invalidResponse, .invalidData: "auth.error.server"
        case .invalidBaseURL: "auth.error.configuration"
        }
    }
}

struct APIErrorEnvelope: Decodable {
    struct APIErrorBody: Decodable {
        let code: String
        let message: String
    }
    let error: APIErrorBody
}

struct APIEnvelope<T: Decodable>: Decodable {
    let data: T
}

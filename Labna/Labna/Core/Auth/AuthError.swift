import Foundation

enum AuthError: Error, Equatable, Sendable {
    case invalidCredentials
    case invalidCurrentPassword
    case duplicateAccount
    case passwordReuse
    case validation(String)
    case expiredSession
    case unauthorized
    case network(URLError.Code)
    case httpStatus(Int, String?)
    /// The order was refused by a checkout specific rule. Kept apart from
    /// `.validation` so the review screen can explain which line is at fault.
    case checkout(CheckoutRejection)
    case invalidResponse
    case invalidData
    case invalidBaseURL

    var messageKey: String {
        switch self {
        case .invalidCredentials: "auth.error.invalidCredentials"
        case .invalidCurrentPassword: "auth.error.invalidCurrentPassword"
        case .duplicateAccount: "auth.error.duplicateAccount"
        case .passwordReuse: "auth.error.passwordReuse"
        case .validation: "auth.error.validation"
        case .expiredSession: "auth.error.expiredSession"
        case .unauthorized: "auth.error.unauthorized"
        case .network: "auth.error.network"
        case .httpStatus, .invalidResponse, .invalidData: "auth.error.server"
        case .checkout: "checkout.error.rejected"
        case .invalidBaseURL: "auth.error.configuration"
        }
    }
}

extension AuthError {
    /// Whether this failure means the session is definitively over, as opposed
    /// to a transport problem that leaves the server-side session intact.
    ///
    /// The refresh token outlives the 15-minute access token by 30 days, so only
    /// an explicit rejection from the API may discard it.
    var terminatesSession: Bool {
        switch self {
        case .unauthorized, .expiredSession, .invalidCredentials:
            true
        case .invalidCurrentPassword, .duplicateAccount, .passwordReuse, .validation,
                .network, .httpStatus, .checkout, .invalidResponse, .invalidData, .invalidBaseURL:
            false
        }
    }
}

/// Why the API refused an order. Raw codes match the `ApiError` codes raised by
/// `POST /orders`, and the details carry the offending identifiers so the app
/// can point at the right cart line.
enum CheckoutRejection: Equatable, Sendable {
    case productUnavailable(productID: String?)
    case variantUnavailable(productID: String?, variantID: String?)
    case insufficientStock(productID: String?, variantID: String?, availableQuantity: Int?)
    case invalidBranch
    case noPickupBranch
    case paymentFailed
    /// The order had already moved past the state the API allows cancelling from.
    case orderNotCancellable

    var messageKey: String {
        switch self {
        case .productUnavailable: "checkout.error.productUnavailable"
        case .variantUnavailable: "checkout.error.variantUnavailable"
        case .insufficientStock: "checkout.error.insufficientStock"
        case .invalidBranch: "checkout.error.invalidBranch"
        case .noPickupBranch: "checkout.error.noPickupBranch"
        case .paymentFailed: "checkout.error.payment"
        case .orderNotCancellable: "orders.cancel.notCancellable"
        }
    }

    /// The cart line to blame, when the API named one.
    var line: (productID: String, variantID: String?)? {
        switch self {
        case .insufficientStock(let productID, let variantID, let available):
            guard let productID else { return nil }
            _ = available
            return (productID, variantID)
        case .variantUnavailable(let productID, let variantID):
            guard let productID else { return nil }
            return (productID, variantID)
        case .productUnavailable(let productID):
            guard let productID else { return nil }
            return (productID, nil)
        case .invalidBranch, .noPickupBranch, .paymentFailed, .orderNotCancellable:
            return nil
        }
    }
}

struct APIErrorEnvelope: Decodable {
    struct APIErrorBody: Decodable {
        /// Present on checkout failures, which name the offending line so the
        /// shopper is not left guessing which item changed.
        struct Details: Decodable {
            let productID: String?
            let variantID: String?
            let availableQuantity: Int?
        }

        let code: String
        let message: String
        let details: Details?

        private enum CodingKeys: String, CodingKey { case code, message, details }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            code = try container.decode(String.self, forKey: .code)
            message = try container.decode(String.self, forKey: .message)
            // `details` is `unknown` on the API: a checkout rejection puts the
            // offending line identifiers in it, while a schema failure puts an
            // array of issues. Only the object case is of interest here, so the
            // other shapes must not fail the whole envelope.
            details = try? container.decode(Details.self, forKey: .details)
        }
    }
    let error: APIErrorBody
}

struct APIEnvelope<T: Decodable>: Decodable {
    let data: T
}

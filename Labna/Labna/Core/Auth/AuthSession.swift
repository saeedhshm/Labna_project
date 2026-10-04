import Foundation

struct AuthSession: Codable, Equatable, Sendable {
    let accessToken: String
    let accessTokenExpiresAt: Date
    let refreshCookie: String
    let customer: Customer

    var hasUsableAccessToken: Bool {
        accessTokenExpiresAt > Date().addingTimeInterval(30)
    }
}

struct AuthCredentials: Encodable, Sendable {
    let email: String
    let password: String
}

struct RegisterCustomerInput: Encodable, Sendable {
    let name: String
    let phoneNumber: String
    let email: String
    let password: String
}

struct CustomerAuthResponse: Decodable, Sendable {
    let accessToken: String
    let expiresIn: Int
    let customer: Customer
}

struct LogoutResponse: Decodable, Sendable {
    let loggedOut: Bool
}

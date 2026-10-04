import Foundation

struct Customer: Codable, Equatable, Sendable, Identifiable {
    let id: String
    let name: String
    let phoneNumber: String
    let email: String
    let addresses: [CustomerAddress]
    let createdAt: String
}

struct CustomerAddress: Codable, Equatable, Sendable, Identifiable {
    let id: String
    let label: String
    let city: String
    let area: String
    let street: String
    let building: String
    let floor: String?
    let apartment: String?
    let notes: String?
    let recipientName: String?
    let phoneNumber: String?
    let isDefault: Bool
}

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

    func withDefault(_ isDefault: Bool) -> CustomerAddress {
        CustomerAddress(
            id: id, label: label, city: city, area: area, street: street, building: building,
            floor: floor, apartment: apartment, notes: notes, recipientName: recipientName,
            phoneNumber: phoneNumber, isDefault: isDefault
        )
    }
}

/// Address payload for `POST /customer/addresses` and `PATCH /customer/addresses/:id`.
///
/// Field names and limits mirror `customerAddressInput` in `@labna/contracts`
/// so the API validates exactly the shape the storefront sends. `recipientName`
/// and `phoneNumber` are optional: the API falls back to the signed-in
/// customer's own values when they are omitted, so an empty string is encoded
/// as an absent key rather than an invalid empty value.
struct CustomerAddressInput: Codable, Equatable, Sendable {
    var label: String
    var city: String
    var area: String
    var street: String
    var building: String
    var floor: String
    var apartment: String
    var notes: String
    var recipientName: String?
    var phoneNumber: String?
    var isDefault: Bool
}

extension Array where Element == CustomerAddress {
    /// Replaces or appends one address and, when it is the new default,
    /// clears the flag on every other entry the way the API does.
    func inserting(_ address: CustomerAddress) -> [CustomerAddress] {
        var list = contains { $0.id == address.id }
            ? map { $0.id == address.id ? address : $0 }
            : self + [address]
        if address.isDefault {
            list = list.map { $0.id == address.id ? $0 : $0.withDefault(false) }
        }
        return list
    }

    func removingAddress(id: String) -> [CustomerAddress] {
        filter { $0.id != id }
    }

    func defaultAddressID() -> String? {
        first(where: \.isDefault)?.id
    }
}

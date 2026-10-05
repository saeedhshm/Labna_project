import Foundation

/// Editable address fields, kept as strings so the form can hold raw input
/// before it is trimmed into a `CustomerAddressInput`.
struct AddressFormDraft: Equatable, Sendable {
    var label = ""
    var recipientName = ""
    var phoneNumber = ""
    var city = ""
    var area = ""
    var street = ""
    var building = ""
    var floor = ""
    var apartment = ""
    var notes = ""
    var isDefault = false

    init() {}

    init(address: CustomerAddress) {
        label = address.label
        recipientName = address.recipientName ?? ""
        phoneNumber = address.phoneNumber ?? ""
        city = address.city
        area = address.area
        street = address.street
        building = address.building
        floor = address.floor ?? ""
        apartment = address.apartment ?? ""
        notes = address.notes ?? ""
        isDefault = address.isDefault
    }

    /// Prefills the recipient with the signed-in customer, mirroring the
    /// storefront's blank address form.
    init(customer: Customer?) {
        recipientName = customer?.name ?? ""
        phoneNumber = customer?.phoneNumber ?? ""
    }

    /// Trimmed payload ready for the API. Empty optional contact fields are
    /// dropped so the API falls back to the customer's own name and phone.
    func input() -> CustomerAddressInput {
        CustomerAddressInput(
            label: label.trimmed,
            city: city.trimmed,
            area: area.trimmed,
            street: street.trimmed,
            building: building.trimmed,
            floor: floor.trimmed,
            apartment: apartment.trimmed,
            notes: notes.trimmed,
            recipientName: recipientName.trimmed.nilIfEmpty,
            phoneNumber: phoneNumber.trimmed.nilIfEmpty,
            isDefault: isDefault
        )
    }

    /// Validation messages keyed by field, using the same limits as
    /// `customerAddressInput` in `@labna/contracts`. Values are localization
    /// keys so both languages stay in the string catalog.
    func validationErrors() -> [AddressFormField: String] {
        var errors: [AddressFormField: String] = [:]
        if !(1...80).contains(label.trimmed.count) {
            errors[.label] = "addresses.error.labelRange"
        }
        if !(2...100).contains(city.trimmed.count) {
            errors[.city] = "addresses.error.cityAreaRange"
        }
        if !(2...100).contains(area.trimmed.count) {
            errors[.area] = "addresses.error.cityAreaRange"
        }
        if !(3...200).contains(street.trimmed.count) {
            errors[.street] = "addresses.error.streetRange"
        }
        if !(1...50).contains(building.trimmed.count) {
            errors[.building] = "addresses.error.buildingRange"
        }
        if floor.trimmed.count > 50 {
            errors[.floor] = "addresses.error.optionalMax"
        }
        if apartment.trimmed.count > 50 {
            errors[.apartment] = "addresses.error.optionalMax"
        }
        if notes.trimmed.count > 500 {
            errors[.notes] = "addresses.error.notesMax"
        }
        let recipient = recipientName.trimmed
        if !recipient.isEmpty && !(2...120).contains(recipient.count) {
            errors[.recipientName] = "addresses.error.recipientRange"
        }
        let phone = phoneNumber.trimmed
        if !phone.isEmpty && !Self.isValidPhoneNumber(phone) {
            errors[.phoneNumber] = "addresses.error.phoneInvalid"
        }
        return errors
    }

    var isValid: Bool {
        validationErrors().isEmpty
    }

    /// `^\+[1-9]\d{7,14}$` exactly as the contract defines it: a leading `+`,
    /// a first digit between 1 and 9, then 7 to 14 more digits.
    static func isValidPhoneNumber(_ raw: String) -> Bool {
        guard raw.hasPrefix("+") else { return false }
        let digits = Array(raw.dropFirst())
        guard (8...15).contains(digits.count),
              let first = digits.first,
              first != "0",
              first != "+",
              first.isASCII,
              first.isNumber,
              digits.allSatisfy({ $0.isASCII && $0.isNumber })
        else { return false }
        return true
    }
}

/// The address fields a form can report an error for.
enum AddressFormField: String, CaseIterable, Sendable {
    case label
    case recipientName
    case phoneNumber
    case city
    case area
    case street
    case building
    case floor
    case apartment
    case notes
}

private extension String {
    var trimmed: String {
        trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}

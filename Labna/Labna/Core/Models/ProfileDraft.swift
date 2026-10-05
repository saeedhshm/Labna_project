import Foundation
import SwiftUI

/// Editable profile fields, validated against the same limits the API enforces
/// on `customerProfilePatch` before a request is sent.
///
/// The server stays authoritative: this only avoids a pointless round trip for
/// input the API would reject anyway. Every limit here mirrors
/// `checkoutCustomer` in `@labna/contracts`, which `customerProfilePatch` reuses.
struct ProfileDraft: Equatable, Sendable {
    enum Field: String, CaseIterable, Sendable {
        case name
        case phoneNumber
        case email
    }

    var name: String
    var phoneNumber: String
    var email: String

    init(name: String, phoneNumber: String, email: String) {
        self.name = name
        self.phoneNumber = phoneNumber
        self.email = email
    }

    init(customer: Customer) {
        self.init(name: customer.name, phoneNumber: customer.phoneNumber, email: customer.email)
    }

    /// Trimmed payload ready for the API. Blank values are rejected rather than
    /// silently clearing a field, so this never sends an empty string.
    func input() -> CustomerProfilePatch {
        CustomerProfilePatch(
            name: name.trimmed.nilIfEmpty,
            phoneNumber: phoneNumber.trimmed.nilIfEmpty,
            email: email.trimmed.nilIfEmpty
        )
    }

    func validationErrors() -> [Field: String] {
        var errors: [Field: String] = [:]
        let trimmedName = name.trimmed
        if !(2...120).contains(trimmedName.count) {
            errors[.name] = "profile.error.nameRange"
        }
        if !Self.isValidPhoneNumber(phoneNumber.trimmed) {
            errors[.phoneNumber] = "profile.error.phoneInvalid"
        }
        let trimmedEmail = email.trimmed
        if !trimmedEmail.contains("@") || trimmedEmail.contains(" ") {
            errors[.email] = "profile.error.emailInvalid"
        }
        return errors
    }

    var isValid: Bool { validationErrors().isEmpty }

    /// `^\+[1-9]\d{7,14}$` exactly as `checkoutCustomer` defines it: a leading
    /// `+`, a first digit between 1 and 9, then 7 to 14 more digits.
    static func isValidPhoneNumber(_ raw: String) -> Bool {
        guard raw.hasPrefix("+") else { return false }
        let digits = raw.dropFirst()
        guard (8...15).contains(digits.count),
              let first = digits.first,
              first != "0",
              first.isASCII,
              first.isNumber,
              digits.allSatisfy({ $0.isASCII && $0.isNumber })
        else { return false }
        return true
    }
}

/// Client-side rules for changing a password, kept out of the view so they can be
/// tested directly. The API's `customerPasswordPatch` remains authoritative.
enum PasswordChangeDraft: Equatable, Sendable {
    enum Problem: Equatable, Sendable {
        case tooShort
        case tooLong
        case mismatched

        var messageKey: LocalizedStringKey {
            switch self {
            case .tooShort: "account.passwordTooShort"
            case .tooLong: "account.passwordTooLong"
            case .mismatched: "account.passwordMismatch"
            }
        }
    }

    /// The API requires 8 to 200 characters for the new password.
    static let minimumLength = 8
    static let maximumLength = 200

    static func validate(newPassword: String, confirmation: String) -> Problem? {
        guard newPassword.count >= minimumLength else { return .tooShort }
        guard newPassword.count <= maximumLength else { return .tooLong }
        guard newPassword == confirmation else { return .mismatched }
        return nil
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

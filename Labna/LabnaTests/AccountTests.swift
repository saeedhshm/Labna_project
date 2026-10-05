import Foundation
import SwiftUI
import Testing
@testable import Labna

/// Covers the client-side profile and password rules, and that the store
/// surfaces each server outcome distinctly. Network behaviour itself is proven
/// against the real API in `AccountLiveBackendTests`.
@MainActor
@Suite(.serialized)
struct AccountTests {
    private func customer() -> Customer {
        Customer(
            id: "customer-1",
            name: "Demo Customer",
            phoneNumber: "+201012345678",
            email: "customer@example.com",
            addresses: [],
            createdAt: "2026-01-01T00:00:00.000Z"
        )
    }

    // MARK: - Profile validation

    @Test func profileValidationMirrorsTheContractLimits() {
        var draft = ProfileDraft(name: "Demo Customer", phoneNumber: "+201012345678", email: "customer@example.com")
        #expect(draft.validationErrors().isEmpty)
        #expect(draft.isValid)

        // The API requires 2...120 characters for the name.
        draft.name = "D"
        #expect(draft.validationErrors()[.name] == "profile.error.nameRange")
        draft.name = String(repeating: "n", count: 121)
        #expect(draft.validationErrors()[.name] == "profile.error.nameRange")
        draft.name = "Demo Customer"
        #expect(draft.validationErrors()[.name] == nil)

        #expect(draft.validationErrors()[.email] == nil)
        draft.email = "not-an-email"
        #expect(draft.validationErrors()[.email] == "profile.error.emailInvalid")
        draft.email = "has space@example.com"
        #expect(draft.validationErrors()[.email] == "profile.error.emailInvalid")
        draft.email = "customer@example.com"

        #expect(draft.validationErrors()[.phoneNumber] == nil)
    }

    @Test func phoneNumbersFollowTheContractPattern() {
        #expect(ProfileDraft.isValidPhoneNumber("+201012345678"))
        #expect(ProfileDraft.isValidPhoneNumber("+12345678"))
        #expect(ProfileDraft.isValidPhoneNumber("+123456789012345"))
        #expect(!ProfileDraft.isValidPhoneNumber("+012345678"))
        #expect(!ProfileDraft.isValidPhoneNumber("201012345678"))
        // The contract regex is ^\+[1-9]\d{7,14}$, so 8 to 15 digits in total.
        #expect(!ProfileDraft.isValidPhoneNumber("+2010123"))
        #expect(ProfileDraft.isValidPhoneNumber("+20101234"))
        #expect(ProfileDraft.isValidPhoneNumber("+201012345"))
        #expect(!ProfileDraft.isValidPhoneNumber("+2010123456789012"))
        #expect(!ProfileDraft.isValidPhoneNumber("+20101234567a"))
        #expect(!ProfileDraft.isValidPhoneNumber(""))
    }

    @Test func profileInputIsTrimmedAndNeverSendsEmptyValues() {
        let draft = ProfileDraft(name: "  Demo Customer  ", phoneNumber: " +201012345678 ", email: " customer@example.com ")
        let input = draft.input()
        #expect(input.name == "Demo Customer")
        #expect(input.phoneNumber == "+201012345678")
        #expect(input.email == "customer@example.com")

        // A blank field must be omitted rather than sent as "", which the strict
        // schema would reject as a validation failure.
        let blank = ProfileDraft(name: "Demo", phoneNumber: "+201012345678", email: "").input()
        #expect(blank.email == nil)
    }

    @Test func profileDraftPrefillsFromTheAuthenticatedCustomer() {
        let draft = ProfileDraft(customer: customer())
        #expect(draft.name == "Demo Customer")
        #expect(draft.email == "customer@example.com")
        #expect(draft.isValid)
    }

    // MARK: - Password rules

    @Test func passwordValidationCatchesShortAndMismatchedEntries() {
        #expect(PasswordChangeDraft.validate(newPassword: "password123", confirmation: "password123") == nil)
        #expect(PasswordChangeDraft.validate(newPassword: "short", confirmation: "short") == .tooShort)
        #expect(PasswordChangeDraft.validate(newPassword: "password123", confirmation: "password124") == .mismatched)
        // The API caps the new password at 200 characters.
        let tooLong = String(repeating: "a", count: PasswordChangeDraft.maximumLength + 1)
        #expect(PasswordChangeDraft.validate(newPassword: tooLong, confirmation: tooLong) == .tooLong)
        let atLimit = String(repeating: "a", count: PasswordChangeDraft.maximumLength)
        #expect(PasswordChangeDraft.validate(newPassword: atLimit, confirmation: atLimit) == nil)
    }

    @Test func passwordProblemsMapToLocalizedMessages() {
        #expect(PasswordChangeDraft.Problem.tooShort.messageKey == "account.passwordTooShort")
        #expect(PasswordChangeDraft.Problem.tooLong.messageKey == "account.passwordTooLong")
        #expect(PasswordChangeDraft.Problem.mismatched.messageKey == "account.passwordMismatch")
    }

    // MARK: - Store state

    @Test func theStoreStartsUnknownAndBecomesGuestWithoutASession() async throws {
        let store = AuthStore(service: AuthServiceForTests.makeService())
        #expect(store.state == .unknown)
        await store.restore()
        #expect(store.state == .guest)
        #expect(store.isAuthenticated == false)
        #expect(store.customer == nil)
    }

    @Test func aSuccessfulProfileUpdateReplacesTheInMemoryCustomer() async throws {
        let store = await AuthServiceForTests.signedInStore(
            name: "Demo Customer",
            phoneNumber: "+201012345678",
            email: "customer@example.com",
            profileName: "Updated Customer",
            profilePhone: "+201099999999",
            profileEmail: "updated@example.com"
        )
        #expect(store.isAuthenticated)
        #expect(store.customer?.name == "Demo Customer")
        #expect(await store.updateProfile(
            name: "Updated Customer",
            phoneNumber: "+201099999999",
            email: "updated@example.com"
        ))
        #expect(store.customer?.name == "Updated Customer")
        #expect(store.customer?.phoneNumber == "+201099999999")
        #expect(store.customer?.email == "updated@example.com")
    }

    @Test func aRejectedPasswordChangeIsReportedAndKeepsTheSession() async throws {
        // The backend answers 401 INVALID_CURRENT_PASSWORD for a wrong current
        // password and does not revoke anything.
        let store = await AuthServiceForTests.signedInStore(passwordChange: .invalidCurrentPassword)
        #expect(store.isAuthenticated)
        #expect(!(await store.changePassword(currentPassword: "wrong", newPassword: "brandNewPassword456")))
        #expect(store.lastError == .invalidCurrentPassword)
        // A rejected attempt must not sign the user out.
        #expect(store.isAuthenticated)
        #expect(store.state != .guest)
    }

    @Test func reusingTheCurrentPasswordIsReportedAsPasswordReuse() async throws {
        let store = await AuthServiceForTests.signedInStore(passwordChange: .passwordReuse)
        #expect(!(await store.changePassword(currentPassword: "password123", newPassword: "password123")))
        #expect(store.lastError == .passwordReuse)
        #expect(store.isAuthenticated)
    }

    @Test func aSuccessfulPasswordChangeClearsLocalStateAndReturnsToGuest() async throws {
        // The API revokes every session for the customer, so the app must drop
        // its secure copy and show the login form again.
        let store = await AuthServiceForTests.signedInStore(passwordChange: .success)
        #expect(store.isAuthenticated)
        #expect(await store.changePassword(currentPassword: "password123", newPassword: "brandNewPassword456"))
        #expect(store.state == .guest)
        #expect(store.customer == nil)
    }

    @Test func aNetworkFailureDuringProfileUpdateKeepsTheCustomer() async throws {
        let store = await AuthServiceForTests.signedInStore(profileUpdate: .network)
        #expect(!(await store.updateProfile(name: "Someone Else", phoneNumber: "+201000000000", email: "else@example.com")))
        #expect(store.lastError == .network(.notConnectedToInternet))
        // The previously loaded profile stays visible rather than blanking out.
        #expect(store.isAuthenticated)
        #expect(store.customer?.name == "Demo Customer")
    }

    @Test func logoutReturnsToGuestAndClearsTheCustomer() async throws {
        let store = await AuthServiceForTests.signedInStore()
        #expect(store.isAuthenticated)
        await store.logout()
        #expect(store.state == .guest)
        #expect(store.customer == nil)
        #expect(store.isAuthenticated == false)
    }

    @Test func aReusedSessionIsRejectedAndFallsBackToGuest() async throws {
        let store = await AuthServiceForTests.signedInStore(me: .unauthorized)
        // The API no longer accepts the access token, so the screen must not
        // keep presenting a signed-in account.
        #expect(store.isAuthenticated == false)
        #expect(store.state == .guest)
    }

    @Test func sensitiveValuesNeverReachThePersistedSession() async throws {
        // The stored session carries the refresh token and access token only;
        // no password is ever part of it.
        let storage = AuthServiceForTests.storageForTests()
        let service = AuthServiceForTests.service(storage: storage)
        _ = try await service.register(
            name: "Demo Customer",
            phoneNumber: "+201012345678",
            email: "customer@example.com",
            password: "password123"
        )
        let loaded = try storage.load()
        let persisted = try #require(loaded)
        let encoded = try JSONEncoder().encode(persisted)
        let text = String(decoding: encoded, as: UTF8.self)
        #expect(!text.contains("password123"))
        #expect(text.contains("customer@example.com"))
    }
}

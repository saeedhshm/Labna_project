import Foundation
import Testing
@testable import Labna

/// Verifies saved-address management against the API running on
/// `127.0.0.1:3001`.
///
/// These tests assert the behaviour the API actually implements rather than what
/// a stub could be made to agree with:
///
/// - the first saved address becomes the default even when the client asks for
///   `isDefault: false` (`normalizeAddresses` in `customer-auth.ts`),
/// - deleting the default promotes the next address,
/// - `recipientName` and `phoneNumber` may be omitted, in which case the API
///   falls back to the signed-in customer's own values,
/// - ownership is derived from the Bearer token, so one customer cannot reach
///   another's addresses.
///
/// Skips itself when the backend is unreachable so the suite still runs without
/// `npm run dev:api`.
@MainActor
@Suite(.serialized)
struct AddressesLiveBackendTests {
    private static let baseURL = URL(string: "http://127.0.0.1:3001/api/v1")!

    private func backendIsReachable() async -> Bool {
        var request = URLRequest(url: Self.baseURL.appendingPathComponent("products"))
        request.timeoutInterval = 3
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        guard let (_, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse else { return false }
        return (200..<300).contains(http.statusCode)
    }

    /// The auth router allows 50 requests per 15 minutes, so a limiter response
    /// means "try later" rather than a product defect.
    private func skipIfRateLimited(_ body: () async throws -> Void) async throws {
        do {
            try await body()
        } catch let error as AuthError {
            if case .httpStatus(let status, _) = error, status == 429 { return }
            throw error
        }
    }

    /// Every test registers its own customer so the address book starts empty;
    /// the suite is written to stay inside the auth router's 50-request window.
    private struct Session {
        let service: AuthService
        let auth: AuthStore
        let storage: LiveAccountSessionStore
        let customerID: String
    }

    private func signedIn() async throws -> Session {
        let email = "ios-addr-\(UUID().uuidString.prefix(8))@example.com".lowercased()
        let storage = LiveAccountSessionStore()
        let service = AuthService(baseURL: Self.baseURL, session: AuthService.defaultSession(), storage: storage)
        let registered = try await service.register(
            name: "Address Tester",
            phoneNumber: "+201012345678",
            email: email,
            password: "password123"
        )
        let auth = AuthStore(service: service)
        await auth.restore()
        return Session(service: service, auth: auth, storage: storage, customerID: registered.id)
    }

    /// Every contract field filled in, so a round trip is unambiguous.
    private func fullInput(
        label: String,
        recipient: String? = "Recipient Name",
        phone: String? = "+201099988877",
        isDefault: Bool = false
    ) -> CustomerAddressInput {
        CustomerAddressInput(
            label: label,
            city: "Cairo",
            area: "Maadi",
            street: "Street 15",
            building: "Building 7",
            floor: "3",
            apartment: "A12",
            notes: "Ring the bell twice",
            recipientName: recipient,
            phoneNumber: phone,
            isDefault: isDefault
        )
    }

    @Test func everyContractFieldSurvivesTheRoundTrip() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let session = try await signedIn()
            let created = try await session.service.createAddress(fullInput(label: "Home"))

            #expect(created.label == "Home")
            #expect(created.city == "Cairo")
            #expect(created.area == "Maadi")
            #expect(created.street == "Street 15")
            #expect(created.building == "Building 7")
            #expect(created.floor == "3")
            #expect(created.apartment == "A12")
            #expect(created.notes == "Ring the bell twice")
            #expect(created.recipientName == "Recipient Name")
            #expect(created.phoneNumber == "+201099988877")

            // The API forces the first saved address to be the default even
            // though the request asked for `isDefault: false`.
            #expect(created.isDefault)

            let list = try await session.service.addresses()
            #expect(list.count == 1)
            #expect(list.first?.id == created.id)
            #expect(list.first?.notes == "Ring the bell twice")
            #expect(list.defaultAddressID() == created.id)
        }
    }

    @Test func settingADefaultDemotesThePreviousOne() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let session = try await signedIn()
            let first = try await session.service.createAddress(fullInput(label: "Home"))
            let second = try await session.service.createAddress(
                fullInput(label: "Work", recipient: "Work Recipient", isDefault: true)
            )
            #expect(second.isDefault)

            // Exactly one default survives, and it is the one just requested.
            let afterCreate = try await session.service.addresses()
            #expect(afterCreate.filter(\.isDefault).count == 1)
            #expect(afterCreate.first { $0.id == first.id }?.isDefault == false)

            // Switching back through the dedicated default route.
            let promoted = try await session.service.setDefaultAddress(id: first.id)
            #expect(promoted.isDefault)
            let afterSwitch = try await session.service.addresses()
            #expect(afterSwitch.filter(\.isDefault).count == 1)
            #expect(afterSwitch.defaultAddressID() == first.id)
        }
    }

    @Test func editingAnAddressKeepsItInPlace() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let session = try await signedIn()
            let home = try await session.service.createAddress(fullInput(label: "Home"))
            _ = try await session.service.createAddress(fullInput(label: "Work", recipient: "Work Recipient"))

            var edited = fullInput(label: "Home edited")
            edited.apartment = "B4"
            edited.notes = ""
            let updated = try await session.service.updateAddress(id: home.id, input: edited)

            #expect(updated.id == home.id)
            #expect(updated.label == "Home edited")
            #expect(updated.apartment == "B4")
            #expect(updated.notes == "")
            #expect(updated.isDefault, "Editing the default must not silently drop the flag")

            let list = try await session.service.addresses()
            #expect(list.count == 2)
            #expect(list.contains { $0.label == "Home edited" })
            #expect(list.filter(\.isDefault).count == 1)
        }
    }

    @Test func deletingTheDefaultPromotesAnotherAddress() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let session = try await signedIn()
            let home = try await session.service.createAddress(fullInput(label: "Home"))
            let work = try await session.service.createAddress(fullInput(label: "Work", recipient: "Work Recipient"))
            #expect(home.isDefault)

            let remaining = try await session.service.deleteAddress(id: home.id)
            #expect(remaining.count == 1)
            #expect(remaining.first?.id == work.id)
            // `normalizeAddresses` always leaves exactly one default behind.
            #expect(remaining.defaultAddressID() == work.id)

            let list = try await session.service.addresses()
            #expect(list.count == 1)
            #expect(list.first?.isDefault == true)

            // Removing the last address leaves the customer with an empty book.
            let emptied = try await session.service.deleteAddress(id: work.id)
            #expect(emptied.isEmpty)
            let finalList = try await session.service.addresses()
            #expect(finalList.isEmpty)
        }
    }

    @Test func omittedContactFieldsFallBackToTheSignedInCustomer() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let session = try await signedIn()
            let created = try await session.service.createAddress(
                fullInput(label: "Home", recipient: nil, phone: nil)
            )
            #expect(created.recipientName == "Address Tester")
            #expect(created.phoneNumber == "+201012345678")
        }
    }

    @Test func theSharedAddressBookStaysInStepForCheckout() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let session = try await signedIn()
            let store = AddressesStore(service: session.service, auth: session.auth)

            #expect(store.phase == .idle)
            await store.load()
            #expect(store.phase == .loaded)
            #expect(store.isEmpty)
            let signedInCustomer = try #require(session.auth.customer)
            #expect(signedInCustomer.addresses.isEmpty)

            #expect(await store.add(fullInput(label: "Home")))
            // Checkout will read the shared copy, so it must already be updated.
            let afterAdd = try #require(session.auth.customer)
            #expect(afterAdd.addresses.count == 1)
            #expect(afterAdd.addresses.first?.label == "Home")

            let created = try #require(store.addresses.first)
            #expect(await store.update(id: created.id, input: fullInput(label: "Home edited")))
            let afterEdit = try #require(session.auth.customer)
            #expect(afterEdit.addresses.first?.label == "Home edited")

            #expect(await store.delete(id: created.id))
            #expect(store.isEmpty)
            let afterDelete = try #require(session.auth.customer)
            #expect(afterDelete.addresses.isEmpty)
        }
    }

    @Test func unauthorizedSessionsAreRejectedAndEndTheLocalSession() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            // No session was ever stored, so there is no Bearer token to send.
            let anonymous = AuthService(
                baseURL: Self.baseURL,
                session: AuthService.defaultSession(),
                storage: LiveAccountSessionStore()
            )
            do {
                _ = try await anonymous.addresses()
                Issue.record("An unauthenticated address request should not succeed")
            } catch let error as AuthError {
                #expect(error == .unauthorized || error == .expiredSession)
            }

            let session = try await signedIn()
            let live = try #require(session.storage.snapshot)

            // Rebuilds the app after a relaunch with credentials the server no
            // longer honours. Both halves are unusable: `AuthService` caches a
            // still-valid access token in memory, so only a fresh service that
            // reloads from storage reproduces the real failure.
            let staleStorage = LiveAccountSessionStore(AuthSession(
                accessToken: "not-a-real-token",
                accessTokenExpiresAt: Date().addingTimeInterval(-60),
                refreshCookie: "not-a-real-refresh-token",
                customer: live.customer
            ))
            let staleService = AuthService(
                baseURL: Self.baseURL,
                session: AuthService.defaultSession(),
                storage: staleStorage
            )
            let staleAuth = AuthStore(service: staleService)
            await staleAuth.restore()

            #expect(!staleAuth.isAuthenticated, "A rejected session must return the app to the guest form")
            #expect(staleStorage.snapshot == nil, "Rejected credentials must not stay in secure storage")

            // The address screen must react the same way once the session is gone.
            let store = AddressesStore(service: staleService, auth: staleAuth)
            await store.load()
            #expect(store.lastError == .unauthorized || store.lastError == .expiredSession)
            #expect(store.addresses.isEmpty)
        }
    }

    @Test func theAPIRejectsInputThatBreaksTheContract() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let session = try await signedIn()

            var tooLong = fullInput(label: "Home")
            tooLong.label = String(repeating: "a", count: 81)
            await expectValidationFailure(overriding: { tooLong }, on: session.service)

            var badPhone = fullInput(label: "Home")
            badPhone.phoneNumber = "01012345678"
            await expectValidationFailure(overriding: { badPhone }, on: session.service)

            var shortStreet = fullInput(label: "Home")
            shortStreet.street = "ab"
            await expectValidationFailure(overriding: { shortStreet }, on: session.service)
        }
    }

    @Test func anUnknownAddressIsReportedAsNotFound() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let session = try await signedIn()
            do {
                _ = try await session.service.deleteAddress(id: "missing-address")
                Issue.record("Deleting an unknown address should fail")
            } catch let error as AuthError {
                guard case .httpStatus(let status, _) = error else {
                    Issue.record("Expected an HTTP status error, got \(error)")
                    return
                }
                #expect(status == 404)
            }
        }
    }

    @Test func aSessionCannotReachAnotherCustomersAddresses() async throws {
        guard await backendIsReachable() else { return }
        try await skipIfRateLimited {
            let owner = try await signedIn()
            let owned = try await owner.service.createAddress(fullInput(label: "Owner home"))

            // A second, unrelated session must not be able to touch that address.
            let other = try await signedIn()
            #expect(other.customerID != owner.customerID)
            #expect(other.customerID != owned.id)

            await expectNotFound { try await other.service.deleteAddress(id: owned.id) }
            await expectNotFound { try await other.service.setDefaultAddress(id: owned.id) }

            // Ownership is derived from the token, so each list stays private.
            let otherList = try await other.service.addresses()
            #expect(otherList.isEmpty)
            let ownerList = try await owner.service.addresses()
            #expect(ownerList.count == 1)
            #expect(ownerList.first?.label == "Owner home")
        }
    }

    // MARK: - Helpers

    private func expectValidationFailure(
        overriding input: @escaping @Sendable () -> CustomerAddressInput,
        on service: AuthService
    ) async {
        do {
            _ = try await service.createAddress(input())
            Issue.record("The contract should have rejected this address")
        } catch let error as AuthError {
            guard case .validation = error else {
                Issue.record("Expected a validation error, got \(error)")
                return
            }
        } catch {
            Issue.record("Unexpected error: \(error)")
        }
    }

    private func expectNotFound(_ operation: () async throws -> some Any) async {
        do {
            _ = try await operation()
            Issue.record("The API should have reported the address as missing")
        } catch let error as AuthError {
            guard case .httpStatus(let status, _) = error else {
                Issue.record("Expected an HTTP status error, got \(error)")
                return
            }
            #expect(status == 404)
        } catch {
            Issue.record("Unexpected error: \(error)")
        }
    }
}

//
//  LabnaTests.swift
//  LabnaTests
//
//  Created by DEV-SAEEDHASHIM on 27/09/2026.
//

import Foundation
import Testing
@testable import Labna

struct LabnaTests {

    @Test @MainActor
    func selectedLanguageIsPersisted() {
        let suiteName = "LabnaTests.AppSettings"
        let storage = UserDefaults(suiteName: suiteName)!
        storage.removePersistentDomain(forName: suiteName)

        let settings = AppSettings(storage: storage)
        settings.language = .arabic

        let restoredSettings = AppSettings(storage: storage)
        #expect(restoredSettings.language == .arabic)

        storage.removePersistentDomain(forName: suiteName)
    }

    @Test
    func priceUsesMinorUnitsAndRequestedLocale() {
        let english = PriceFormatter.string(
            minorUnits: 4500,
            currencyCode: "EGP",
            locale: Locale(identifier: "en_EG")
        )
        let arabic = PriceFormatter.string(
            minorUnits: 4500,
            currencyCode: "EGP",
            locale: Locale(identifier: "ar_EG")
        )

        #expect(english.contains("45.00"))
        #expect(!arabic.isEmpty)
        #expect(arabic != english)
    }

}

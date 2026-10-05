//
//  LabnaUITests.swift
//  LabnaUITests
//
//  Created by DEV-SAEEDHASHIM on 27/09/2026.
//

import XCTest

final class LabnaUITests: XCTestCase {

    override func setUpWithError() throws {
        // Put setup code here. This method is called before the invocation of each test method in the class.

        // In UI tests it is usually best to stop immediately when a failure occurs.
        continueAfterFailure = false

        // In UI tests it’s important to set the initial state - such as interface orientation - required for your tests before they run. The setUp method is a good place to do this.
    }

    override func tearDownWithError() throws {
        // Put teardown code here. This method is called after the invocation of each test method in the class.
    }

    @MainActor
    func testExample() throws {
        // UI tests must launch the application that they test.
        let app = XCUIApplication()
        app.launch()

        // Use XCTAssert and related functions to verify your tests produce the correct results.
    }

    @MainActor
    func testLanguageSwitchNavigationAndPersistence() throws {
        let app = XCUIApplication()
        // UserDefaults launch arguments give this test a deterministic starting language.
        app.launchArguments = ["-selectedLanguage", "en", "-resetCart"]
        app.launch()

        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.buttons["Home"].waitForExistence(timeout: 10))
        tabs.buttons["Products"].tap()
        XCTAssertTrue(app.navigationBars["Products"].exists)
        tabs.buttons["Cart"].tap()
        XCTAssertTrue(app.navigationBars["Cart"].exists)
        tabs.buttons["More"].tap()
        app.segmentedControls.buttons["Arabic"].tap()

        XCTAssertTrue(tabs.buttons["الرئيسية"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.navigationBars["المزيد"].exists)
        XCTAssertGreaterThan(tabs.buttons["الرئيسية"].frame.midX, tabs.buttons["المزيد"].frame.midX)
        tabs.buttons["المنتجات"].tap()
        XCTAssertTrue(app.navigationBars["المنتجات"].exists)
        tabs.buttons["السلة"].tap()
        XCTAssertTrue(app.navigationBars["السلة"].exists)

        app.terminate()
        app.launchArguments = []
        app.launch()
        XCTAssertTrue(tabs.buttons["الرئيسية"].waitForExistence(timeout: 10))
        tabs.buttons["المزيد"].tap()
        app.segmentedControls.buttons["الإنجليزية"].tap()
        XCTAssertTrue(tabs.buttons["Home"].waitForExistence(timeout: 5))
        XCTAssertLessThan(tabs.buttons["Home"].frame.midX, tabs.buttons["More"].frame.midX)
    }

    @MainActor
    func testMoreInformationAndDemoBranches() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-selectedLanguage", "en", "-resetCart"]
        app.launch()

        let moreTab = app.tabBars.buttons["More"]
        XCTAssertTrue(moreTab.waitForExistence(timeout: 10))
        moreTab.tap()
        XCTAssertTrue(app.staticTexts["more.demoNotice"].exists)
        // The version footer sits at the bottom of the list, so scroll to it.
        let version = app.staticTexts["Version"]
        while !version.exists {
            app.swipeUp()
        }
        XCTAssertTrue(version.exists)

        app.buttons["more.about"].tap()
        XCTAssertTrue(app.navigationBars["About Labna"].waitForExistence(timeout: 5))
        app.navigationBars.buttons.firstMatch.tap()

        app.buttons["more.contact"].tap()
        XCTAssertTrue(app.staticTexts["contact.demoNotice"].waitForExistence(timeout: 5))
        app.navigationBars.buttons.firstMatch.tap()

        app.buttons["more.branches"].tap()
        XCTAssertTrue(app.navigationBars["Branches"].waitForExistence(timeout: 5))
        let cairo = app.buttons["branch.demo-cairo"]
        XCTAssertTrue(cairo.waitForExistence(timeout: 10))
        cairo.tap()
        XCTAssertTrue(app.navigationBars["Cairo — Demo Branch"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["branch.demoNotice"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["branch.map"].exists)
        XCTAssertTrue(app.buttons["branch.directions"].exists)
        XCTAssertFalse(app.buttons["branch.call"].exists)
        XCTAssertTrue(app.staticTexts["No real phone number is available in the demo version."].exists)
    }

    @MainActor
    func testGuestAccountNavigationShowsLoginAndRegister() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-selectedLanguage", "en", "-resetCart"]
        app.launch()

        let moreTab = app.tabBars.buttons["More"]
        XCTAssertTrue(moreTab.waitForExistence(timeout: 10))
        moreTab.tap()
        app.buttons["more.account"].tap()
        XCTAssertTrue(app.navigationBars["Account"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.textFields["auth.email"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.secureTextFields["auth.password"].exists)
        app.segmentedControls.buttons["Create account"].tap()
        XCTAssertTrue(app.textFields["auth.name"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.textFields["auth.phone"].exists)
    }

    @MainActor
    func testHomeBannerCarouselShowsMultipleBanners() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-selectedLanguage", "en", "-resetCart"]
        app.launch()

        let firstBanner = app.buttons["banner.0.fresh-start"]
        XCTAssertTrue(firstBanner.waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["banner.1.meet-labneh"].waitForExistence(timeout: 8))
    }

    @MainActor
    func testHomeSearchExpandsFromAppBar() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-selectedLanguage", "en", "-resetCart"]
        app.launch()

        let openSearch = app.buttons["home.search.open"]
        XCTAssertTrue(openSearch.waitForExistence(timeout: 10))
        XCTAssertFalse(app.textFields["catalog.search.input"].exists)
        openSearch.tap()

        let searchField = app.textFields["catalog.search.input"]
        XCTAssertTrue(searchField.waitForExistence(timeout: 3))
        searchField.tap()
        searchField.typeText("yogurt")
        XCTAssertTrue(app.buttons["product.yogurt-greek"].waitForExistence(timeout: 5))
    }

    @MainActor
    func testOfflineAndImageFailureStates() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-selectedLanguage", "en", "-resetCart", "-simulateCatalogOffline"]
        app.launch()
        XCTAssertTrue(app.buttons["Products"].waitForExistence(timeout: 10), "Products tab should exist while offline")
        app.buttons["Products"].tap()
        XCTAssertTrue(app.buttons["product.milk-full"].waitForExistence(timeout: 10), "Offline launch should still show bundled or cached products")

        app.terminate()
        app.launchArguments = ["-selectedLanguage", "en", "-resetCart", "-simulateImageFailure"]
        app.launch()
        let products = app.buttons["Products"].firstMatch
        XCTAssertTrue(products.waitForExistence(timeout: 10), "Products tab should exist when simulating image failure")
        products.tap()
        let milk = app.buttons["product.milk-full"]
        XCTAssertTrue(milk.waitForExistence(timeout: 10), "Milk product should exist when simulating image failure")
        milk.tap()
        XCTAssertTrue(app.navigationBars["Full Cream Milk"].waitForExistence(timeout: 5), "Product details should open")
        XCTAssertTrue(app.buttons["productDetails.add"].waitForExistence(timeout: 5), "Product details should remain usable when images fail")
    }

    @MainActor
    func testAccessibilityLabelsAtLargestTextSize() throws {
        let app = XCUIApplication()
        app.launchArguments = [
            "-selectedLanguage", "en",
            "-resetCart",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge"
        ]
        app.launch()
        let products = app.buttons["Products"].firstMatch
        XCTAssertTrue(products.waitForExistence(timeout: 10))
        products.tap()

        let milk = app.buttons["product.milk-full"]
        XCTAssertTrue(milk.waitForExistence(timeout: 10))
        XCTAssertTrue(milk.label.contains("Full Cream Milk"))
        let quickAdd = app.buttons["quickAdd.milk-full"]
        XCTAssertEqual(quickAdd.label, "Add")
        milk.tap()
        XCTAssertTrue(app.buttons["Increase quantity"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Decrease quantity"].exists)
        XCTAssertTrue(app.buttons["productDetails.add"].exists)
    }

    @MainActor
    func testBrowseProductAndQuickAdd() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-selectedLanguage", "en", "-resetCart"]
        app.launch()

        let productsTab = app.tabBars.buttons["Products"]
        XCTAssertTrue(productsTab.waitForExistence(timeout: 10))
        productsTab.tap()
        let product = app.buttons["product.milk-full"]
        XCTAssertTrue(product.waitForExistence(timeout: 10))
        product.tap()
        XCTAssertTrue(app.navigationBars["Full Cream Milk"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["variant.milk-full-1000"].exists)
        XCTAssertFalse(app.buttons["variant.milk-full-1000"].isSelected)
        app.buttons["productDetails.add"].tap()
        XCTAssertTrue(app.staticTexts["Full Cream Milk added to cart"].waitForExistence(timeout: 3))

        app.navigationBars.buttons.firstMatch.tap()
        app.buttons["quickAdd.milk-full"].tap()
        XCTAssertTrue(app.buttons["quickAdd.confirm"].waitForExistence(timeout: 5))
        app.buttons["quickAdd.confirm"].tap()
        XCTAssertTrue(app.staticTexts["Full Cream Milk added to cart"].waitForExistence(timeout: 3))

        app.tabBars.buttons["Cart"].tap()
        XCTAssertTrue(app.staticTexts["cart.product.milk-full"].waitForExistence(timeout: 5))
        app.terminate()
        app.launchArguments = ["-selectedLanguage", "en"]
        app.launch()
        app.tabBars.buttons["Cart"].tap()
        XCTAssertTrue(app.staticTexts["cart.product.milk-full"].waitForExistence(timeout: 10))
        app.buttons["cart.checkout"].tap()
        XCTAssertTrue(app.navigationBars["Review order"].waitForExistence(timeout: 5))
        let notes = app.textViews["checkout.notes"]
        notes.tap()
        notes.typeText("Demo note")
        app.buttons["checkout.confirm"].tap()
        XCTAssertTrue(app.staticTexts["checkout.success"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["success.reference"].label.contains("DEMO-"))
        XCTAssertTrue(app.staticTexts["success.disclaimer"].exists)
        app.buttons["success.products"].tap()
        XCTAssertTrue(app.tabBars.buttons["Products"].isSelected)
        app.tabBars.buttons["Cart"].tap()
        XCTAssertTrue(app.staticTexts["Your cart is empty"].waitForExistence(timeout: 5))
    }

    @MainActor
    func testFavoritesCanBeSavedAndOpenedFromMore() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-selectedLanguage", "en", "-resetCart", "-resetFavorites"]
        app.launch()

        XCTAssertTrue(app.tabBars.buttons["Products"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Products"].tap()
        let favorite = app.buttons["favorite.milk-full"]
        XCTAssertTrue(favorite.waitForExistence(timeout: 10))
        favorite.tap()

        app.tabBars.buttons["More"].tap()
        XCTAssertEqual(app.staticTexts["more.favorites.count"].label, "1")
        app.buttons["more.favorites"].tap()
        XCTAssertTrue(app.navigationBars["Favorites"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["product.milk-full"].waitForExistence(timeout: 5))
    }

    @MainActor
    func testRecentlyViewedProductsAppearOnHomeAndViewAll() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-selectedLanguage", "en", "-resetCart", "-resetRecentlyViewed"]
        app.launch()

        XCTAssertTrue(app.tabBars.buttons["Products"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Products"].tap()
        let product = app.buttons["product.milk-full"]
        XCTAssertTrue(product.waitForExistence(timeout: 10))
        product.tap()
        XCTAssertTrue(app.navigationBars["Full Cream Milk"].waitForExistence(timeout: 5))

        app.navigationBars.buttons.firstMatch.tap()
        app.tabBars.buttons["Home"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["recentlyViewed.section"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["product.milk-full"].waitForExistence(timeout: 5))

        app.buttons["recentlyViewed.viewAll"].tap()
        XCTAssertTrue(app.navigationBars["Recently viewed"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["product.milk-full"].waitForExistence(timeout: 5))
    }

    @MainActor
    func testLaunchPerformance() throws {
        // This measures how long it takes to launch your application.
        measure(metrics: [XCTApplicationLaunchMetric()]) {
            XCUIApplication().launch()
        }
    }

    /// Registers a real customer through the running backend, then walks the
    /// authenticated account screen, the profile editor and the password form.
    ///
    /// Skipped when the backend is not running, so the suite still works offline.
    @MainActor
    func testAuthenticatedAccountProfileAndPasswordScreens() async throws {
        guard await backendIsReachable() else {
            throw XCTSkip("Backend not running on 127.0.0.1:3001")
        }
        let email = "ios-ui-\(Int(Date().timeIntervalSince1970))@example.com"

        let app = XCUIApplication()
        app.launchArguments = ["-selectedLanguage", "en", "-resetCart"]
        app.launch()

        let moreTab = app.tabBars.buttons["More"]
        XCTAssertTrue(moreTab.waitForExistence(timeout: 10))
        moreTab.tap()
        app.buttons["more.account"].tap()

        // Sign in through the real form. The account is created through the API
        // first because the phone keypad has no "+" key, which the E.164 rule
        // requires, so it cannot be typed on the Simulator's phone keyboard.
        let seeded = await seedCustomer(email: email)
        XCTAssertTrue(seeded, "Could not seed the account through the backend")

        let emailField = app.textFields["auth.email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 5))
        emailField.tap()
        emailField.typeText(email)
        let password = app.secureTextFields["auth.password"]
        password.tap()
        password.typeText("password123")
        app.buttons["auth.login.submit"].tap()

        // The authenticated screen must show the backend's profile, not a guess.
        XCTAssertTrue(app.descendants(matching: .any)["account.customer"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["UI Account Tester"].exists)
        XCTAssertTrue(app.staticTexts[email.lowercased()].exists)
        XCTAssertTrue(app.buttons["auth.logout"].exists)

        // Profile editor opens pre-filled from the loaded customer.
        app.buttons["account.editProfile"].tap()
        XCTAssertTrue(app.navigationBars["Edit profile"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.textFields["account.name"].exists)
        XCTAssertTrue(app.textFields["account.phone"].exists)
        XCTAssertTrue(app.textFields["account.email"].exists)
        XCTAssertTrue(app.buttons["account.saveProfile"].isEnabled)

        // Change password exposes all three secure fields.
        app.navigationBars.buttons.firstMatch.tap()
        app.buttons["account.changePassword"].tap()
        XCTAssertTrue(app.navigationBars["Change password"].waitForExistence(timeout: 5))
        let current = app.secureTextFields["account.currentPassword"]
        let new = app.secureTextFields["account.newPassword"]
        let confirm = app.secureTextFields["account.confirmPassword"]
        XCTAssertTrue(current.exists)
        XCTAssertTrue(new.exists)
        XCTAssertTrue(confirm.exists)

        // A mismatched confirmation is caught before any request is sent.
        current.tap()
        current.typeText("password123")
        new.tap()
        new.typeText("brandNewPassword456")
        confirm.tap()
        confirm.typeText("brandNewPassword457")
        app.buttons["account.submitPassword"].tap()
        XCTAssertTrue(app.staticTexts["The new passwords do not match."].waitForExistence(timeout: 5))

        // Signing out returns to the guest form.
        app.navigationBars.buttons.firstMatch.tap()
        app.buttons["auth.logout"].tap()
        XCTAssertTrue(app.textFields["auth.email"].waitForExistence(timeout: 15))
    }

    /// Creates the account this test signs in with, using the same public
    /// registration endpoint the app uses.
    private func seedCustomer(email: String) async -> Bool {
        struct Registration: Encodable {
            let name = "UI Account Tester"
            let phoneNumber = "+201012345678"
            let email: String
            let password = "password123"
        }
        var request = URLRequest(url: URL(string: "http://127.0.0.1:3001/api/v1/customer/auth/register")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONEncoder().encode(Registration(email: email))
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { return false }
            return (200..<300).contains(http.statusCode)
        } catch {
            return false
        }
    }

    /// The profile and password screens need a live backend, since registration
    /// and validation are server-driven.
    private func backendIsReachable() async -> Bool {
        var request = URLRequest(url: URL(string: "http://127.0.0.1:3001/health/ready")!)
        request.timeoutInterval = 3
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { return false }
            return (200..<300).contains(http.statusCode)
        } catch {
            return false
        }
    }
}

import XCTest

/// End-to-end coverage for the deep link system using real `labna://` URLs.
///
/// `XCUIApplication.open(_:)` dispatches through the system, so these tests
/// exercise the same path a widget tap or a future push notification uses:
/// URL -> DeepLinkParser -> DeepLink -> AppRouter -> Navigation. When the app is
/// not running the system launches it, which is the cold launch case.
final class LabnaDeepLinkUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["-selectedLanguage", "en", "-resetCart"]
    }

    override func tearDownWithError() throws {
        app = nil
    }

    /// Opens a real URL. Cold launch when the app is terminated, warm otherwise.
    private func open(_ deepLink: String) throws {
        let url = try XCTUnwrap(URL(string: deepLink))
        app.open(url)
    }

    // MARK: - Product

    func testProductDeepLinkFromTerminatedAppOpensProductDetails() throws {
        // Never launched, so the system performs a cold launch for this URL.
        try open("labna://product/milk-full")

        XCTAssertTrue(app.navigationBars["Full Cream Milk"].waitForExistence(timeout: 20),
                      "A cold launched product link must resolve to Product Details")
        XCTAssertTrue(app.buttons["productDetails.add"].exists)
    }

    func testProductDeepLinkWorksWhileTheAppIsRunning() throws {
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Home"].waitForExistence(timeout: 20))

        try open("labna://product/yogurt-greek")

        XCTAssertTrue(app.navigationBars["Greek Yogurt"].waitForExistence(timeout: 20))
    }

    func testProductDeepLinkReplacesAnOpenProductDetailsScreen() throws {
        // Opening a second link from inside Product Details must not corrupt the stack.
        try open("labna://product/milk-full")
        XCTAssertTrue(app.navigationBars["Full Cream Milk"].waitForExistence(timeout: 20))

        try open("labna://product/cheese-labneh")

        XCTAssertTrue(app.navigationBars["Creamy Labneh"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.buttons["productDetails.add"].exists)
    }

    func testProductDeepLinkWorksInArabic() throws {
        app.launchArguments = ["-selectedLanguage", "ar", "-resetCart"]
        try open("labna://product/milk-full")

        XCTAssertTrue(app.tabBars.buttons["الرئيسية"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.buttons["productDetails.add"].waitForExistence(timeout: 20),
                      "The deep link destination works in Arabic too")
    }

    // MARK: - Category

    func testCategoryDeepLinkOpensFilteredCatalog() throws {
        try open("labna://category/cheese")

        XCTAssertTrue(app.tabBars.buttons["Products"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.buttons["product.cheese-white"].waitForExistence(timeout: 20),
                      "The catalog should be filtered by the linked category")
    }

    // MARK: - Tab and More destinations

    func testFavoritesLinkOpensInsideMore() throws {
        try open("labna://favorites")

        XCTAssertTrue(app.navigationBars["Favorites"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.tabBars.buttons["More"].isSelected)
    }

    func testBranchesLinkOpensInsideMore() throws {
        try open("labna://branches")

        XCTAssertTrue(app.navigationBars["Branches"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.tabBars.buttons["More"].isSelected)
    }

    func testRecentlyViewedLinkOpensInsideMore() throws {
        try open("labna://recently-viewed")

        XCTAssertTrue(app.navigationBars["Recently viewed"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.tabBars.buttons["More"].isSelected)
    }

    func testCartLinkSelectsTheCartTab() throws {
        try open("labna://cart")

        XCTAssertTrue(app.tabBars.buttons["Cart"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.tabBars.buttons["Cart"].isSelected)
    }

    // MARK: - Invalid input

    func testUnknownProductLinkDoesNotOpenUnrelatedContent() throws {
        try open("labna://product/deleted-product")

        XCTAssertTrue(app.tabBars.buttons["Home"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.tabBars.buttons["Home"].isSelected)
        XCTAssertFalse(app.navigationBars["Full Cream Milk"].exists)
    }

    func testUnknownCategoryLinkDoesNotOpenUnrelatedContent() throws {
        try open("labna://category/deleted-category")

        XCTAssertTrue(app.tabBars.buttons["Home"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.tabBars.buttons["Home"].isSelected)
    }

    func testUnsupportedAndMalformedLinksAreIgnored() throws {
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Home"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.tabBars.buttons["Home"].isSelected)

        for link in ["labna://unknown-route", "otherapp://cart", "labna://product"] {
            try open(link)
            XCTAssertTrue(app.tabBars.buttons["Home"].waitForExistence(timeout: 20), "Failed for \(link)")
            XCTAssertTrue(app.tabBars.buttons["Home"].isSelected, "Unexpected navigation for \(link)")
        }
    }
}

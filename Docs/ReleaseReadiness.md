# الاختبارات وتجهيز النسخة التجريبية — القسم التاسع

## Automated coverage

### Logic and data

- `MockDataTests`: decodes every bundled JSON file; validates category/product/banner relationships, unique IDs, bilingual text, HTTPS image URLs, positive prices and quantities, EGP minor units, the one-to-three variant limit, demo branches, coordinates, time zones and seven-day hours.
- `CatalogFeatureTests`: Arabic/English search, category filtering, price sorting, sold-out ordering, merging the same pack, separating different packs and integer cart totals.
- `CartStoreTests`: SwiftData restoration, quantity updates, deletion, limits, price changes and unavailable/removed catalog entries.
- `CatalogRepositoryTests`: custom `URLProtocol` network simulation for request paths and headers, successful remote decoding, HTTP failures, malformed JSON, offline, timeout, cancellation, retry and no silent mock fallback.
- `DemoCheckoutTests`: final snapshots, persisted-cart clearing, duplicate submission protection and empty/unavailable cart rejection.

### User journeys

- `testBrowseProductAndQuickAdd`: browse, product details, quick add, persisted cart after relaunch, checkout success, reference, demo disclaimer and empty cart after completion.
- `testLanguageSwitchNavigationAndPersistence`: immediate Arabic/English switching, RTL/LTR tab order and language persistence after relaunch.
- `testOfflineAndImageFailureStates`: deterministic offline catalog error/retry and image failure/retry UI.
- `testAccessibilityLabelsAtLargestTextSize`: largest accessibility text category with product, quick-add, quantity and add-to-cart labels.
- `testMoreInformationAndDemoBranches`: informational pages, demo disclosures, version, branch map, directions and no fake call action.

Run the main suite:

```bash
xcodebuild -project Labna.xcodeproj -scheme Labna \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.1' test
```

Before external review, repeat the critical UI journeys on one compact iPhone and one iPad available on the build machine. Simulator names vary by installed Xcode runtime; examples for this workspace are `iPhone 13` and `iPad mini (A17 Pro)`. Test at default and largest Accessibility text sizes, portrait and landscape where supported. A physical-device pass remains required for launch appearance, Maps handoff, network behavior and VoiceOver focus order.

## App presentation

- `AppIcon.appiconset/AppIcon.png` is a 1024×1024 opaque original asset using Labna's cream, mint and green palette.
- `Info.plist` defines the launch screen using `LaunchBackground` and the vector `LaunchLogo`; it does not mimic the first interactive screen.
- The interface is light-only by product requirement.
- Product, branch, order and contact screens identify demo behavior. No fake phone number, address intake, payment or real order submission exists.

## Images and publishing

Bundled JSON currently references four generic Unsplash images over HTTPS. Exact source links and the release decision are in `Docs/MockData.md`. They are accepted for this clearly marked demo and internal TestFlight review only. Before public App Store submission:

1. Replace them with owned product photography, or verify the current Unsplash license and retain release evidence.
2. Confirm every image accurately represents its named product and does not imply an unavailable brand or package.
3. Update all repeated category/banner/product URLs and rerun `MockDataTests` plus image-failure UI coverage.

## Editing data

The four files in `Labna/Labna/Resources/Data/` are synchronized into the app target automatically. Their contract and validation rules are documented in `Docs/MockData.md`. Preserve stable IDs, translated fields, integer minor-unit prices and valid cross-resource references. Run `MockDataTests` after every edit.

To use an API, construct `AppContainer` with `AppConfiguration(dataSource: .remote(baseURL: ...))`. The endpoint contract, paths, errors and DTO migration guidance are in `Docs/DataLayer.md`. Production credentials and secrets must not be committed to JSON, source files or build settings.

## TestFlight handoff

Uploading cannot be completed without an Apple Developer account, an App Store Connect app record and signing access. When they are available:

1. Select the owning development team and confirm the bundle identifier is unique and matches App Store Connect.
2. Keep automatic signing or supply the team's distribution profile; do not commit certificates or private keys.
3. Increment `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` for the release build.
4. Replace or formally approve the demo image assets and complete App Privacy answers for the final API and analytics behavior.
5. Run all tests, then test a Release build on a physical iPhone with Arabic, English, VoiceOver, large text, offline mode and Maps directions.
6. In Xcode, archive using `Any iOS Device (arm64)`, validate the archive, then upload it to App Store Connect.
7. Add release notes that explicitly describe the local demo checkout and illustrative branch/product data, then distribute to an internal TestFlight group first.

The source is archive-ready without signing. Actual TestFlight upload is intentionally pending account, app-record and signing configuration.

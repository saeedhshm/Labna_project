# المزيد والفروع والإعدادات — القسم الثامن

## More

`MoreView` is the entry point for app information and settings. It includes:

- A persisted Arabic/English language picker that updates locale and layout direction immediately.
- About Labna, Branches and Contact navigation.
- A visible explanation that the current app and its data are demonstrative.
- The app version and build read from the bundle instead of hard-coded display values.

`AboutLabnaView` describes the catalog, bilingual experience and demo scope. `ContactView` intentionally offers no fake email address or phone number; it explains that contact actions will appear only when official details exist.

## Branches

`BranchListView` consumes branches from the shared `CatalogStore`, so loading, failure and empty states follow the same repository behavior as the rest of the catalog. Every demo branch is explicitly badged.

`BranchDetailView` provides:

- Localized name and address.
- A MapKit map centered on the supplied coordinate.
- An action that opens driving directions in Apple Maps.
- All seven opening-hour rows with localized weekday and time formatting.
- A demo-location notice next to the map experience.
- A call action only when a non-demo branch has a valid phone number.

The bundled branches remain illustrative locations with `phoneNumber: null`; therefore no actionable fake phone number is shown.

## Verification

Existing model tests validate unique branch IDs, localized text, coordinates, time zones, seven-day schedules, demo flags and absent phone numbers. The language UI test verifies immediate RTL/LTR switching and persistence after relaunch. The More UI journey verifies About and Contact pages, demo disclosures, bundle version display, branch loading, branch details, MapKit content, directions availability and absence of a call action for demo data.

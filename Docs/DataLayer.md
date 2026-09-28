# طبقة البيانات — القسم الثالث

## Flow

```text
HomeView → CatalogStateView → CatalogStore → CatalogRepository
                                            ↓
                                  JSONCatalogRepository
                                            ↓
                             LocalJSONDataSource / RemoteCatalogDataSource
```

`AppContainer` is the composition root. The default configuration is `.mock`, backed by the app's four bundled JSON files. Views consume `container.catalog` or `container.catalogRepository`, never choose a source or read files directly.

## Switching to a real API

Change the container construction in `LabnaApp.swift`:

```swift
@State private var container = AppContainer(
    configuration: AppConfiguration(
        dataSource: .remote(baseURL: URL(string: "https://YOUR-HOST/v1/catalog/")!)
    )
)
```

Use your real HTTPS host; no production endpoint is configured yet. The current contract expects GET requests to:

- `products`
- `categories`
- `banners`
- `branches`

Paths are appended to the supplied base URL. Each response is a root JSON array matching `Docs/MockData.md`. Requests have `Accept: application/json` and a 30-second timeout. Non-2xx responses are errors. There is no automatic fallback to mock data when remote requests fail.

If the API later introduces envelopes, pagination or different fields, implement a remote DTO adapter in a new `CatalogRepository` and inject it into `AppContainer(repository:)`. Screens and domain models can remain unchanged. Authentication can be added in the remote request layer when its contract is known; credentials do not belong in JSON files or hardcoded URLs.

## Loading and retry

- `CatalogStore.state`: idle, loading, loaded(snapshot), failed(error).
- `loadIfNeeded()` runs on initial display; already-loaded data is reused.
- `reload()` retries or explicitly refreshes. Duplicate simultaneous loads are ignored.
- A snapshot is published only after all four resources succeed, preventing a partially updated catalog.
- Cancellation restores the previous state and does not display a network failure.
- The local source reads file bytes off the main actor. JSON decoding and observable state updates currently run on the main actor, appropriate for the small catalog; revisit decoding isolation for a large API payload.
- `CatalogStateView` supplies translated progress, error messages and a retry action, and cancels its view-owned retry task on disappearance.
- Home now exercises the loading state with its existing foundation content. Product layouts are implemented in the later UI phase.

## Images

`ProductImage(url:aspectRatio:)` wraps NukeUI 12.8.0, installed through Swift Package Manager and recorded in `Package.resolved`.

- Nuke shared pipeline: memory cache and HTTP caching via URLCache (subject to HTTP cache policy; not guaranteed permanent offline storage).
- Loading indicator, nil-URL placeholder and retry button for failed URLs.
- A fixed aspect-ratio region prevents layout changes between loading and success.
- Image pixels are decorative for accessibility; the containing product card should announce the product name.
- All image status and retry text is in String Catalog.

## Verification

`CatalogRepositoryTests` uses an ephemeral URLSession with a custom URLProtocol. No live API is contacted by these tests. Coverage includes equality of local/remote data, request paths/headers, HTTP errors, malformed JSON, offline/timeout/cancellation errors, missing files, invalid configuration, retry, and the default container's bundled catalog.

Run `LabnaTests` and `LabnaUITests/testLanguageSwitchNavigationAndPersistence` from Xcode. Swift Package resolution requires internet on the first build.

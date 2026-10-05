import Foundation

struct AppConfiguration {
    enum DataSource {
        case localJSON
        case remote(baseURL: URL)
    }

    // AppContainer constructs the repository using this selection.
    let dataSource: DataSource

    /// Placeholder until a real deployment exists. Never point this at a
    /// non-HTTPS host: `URL.isAllowedCatalogAPIBaseURL` rejects plain HTTP
    /// everywhere except loopback, so a typo here fails loudly instead of
    /// silently sending traffic in the clear.
    static let productionAPIBaseURL = URL(string: "https://api.labna.example/api/v1")!

    /// The single place the API origin is decided.
    ///
    /// Resolution order, most specific first:
    /// 1. `LABNA_API_BASE_URL` environment variable (per-run / CI override).
    /// 2. `LABNA_API_BASE_URL` in `Info.plist`, set from the
    ///    `LABNA_API_BASE_URL` build setting so each configuration can differ.
    /// 3. Loopback on Simulator, which is where `npm run dev:api` listens.
    /// 4. The production placeholder on device.
    ///
    /// The localhost value is confined to this one place so Simulator
    /// development never needs a URL edited anywhere else.
    static var backendAPIBaseURL: URL {
        if let value = ProcessInfo.processInfo.environment["LABNA_API_BASE_URL"], let url = URL(string: value) {
            return url
        }
        if let value = Bundle.main.object(forInfoDictionaryKey: "LABNA_API_BASE_URL") as? String, let url = URL(string: value) {
            return url
        }
        #if targetEnvironment(simulator)
        return URL(string: "http://127.0.0.1:3001/api/v1")!
        #else
        return productionAPIBaseURL
        #endif
    }

    static let backend = AppConfiguration(dataSource: .remote(baseURL: backendAPIBaseURL))
    static let mock = AppConfiguration(dataSource: .localJSON)
}

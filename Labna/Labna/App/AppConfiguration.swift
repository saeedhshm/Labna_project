import Foundation

struct AppConfiguration {
    enum DataSource {
        case localJSON
        case remote(baseURL: URL)
    }

    // AppContainer constructs the repository using this selection.
    let dataSource: DataSource

    static let productionAPIBaseURL = URL(string: "https://api.labna.example/api/v1")!

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

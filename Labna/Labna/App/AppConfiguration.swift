import Foundation

struct AppConfiguration {
    enum DataSource {
        case localJSON
        case remote(baseURL: URL)
    }

    // AppContainer constructs the repository using this selection.
    let dataSource: DataSource

    static let mock = AppConfiguration(dataSource: .localJSON)
}

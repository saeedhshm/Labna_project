import Foundation

struct RemoteCatalogDataSource: CatalogDataSource {
    let baseURL: URL
    let session: URLSession

    init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func data(for resource: CatalogResource) async throws -> Data {
        try Task.checkCancellation()
        guard baseURL.isAllowedCatalogAPIBaseURL,
              baseURL.query == nil, baseURL.fragment == nil else {
            throw CatalogError.invalidBaseURL
        }
        // e.g. https://api.example.com/v1/catalog/products
        var request = URLRequest(url: baseURL.appendingPathComponent(resource.rawValue))
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 30
        do {
            let (data, response) = try await session.data(for: request)
            try Task.checkCancellation()
            guard let response = response as? HTTPURLResponse else {
                throw CatalogError.invalidResponse
            }
            guard (200..<300).contains(response.statusCode) else {
                throw CatalogError.httpStatus(response.statusCode)
            }
            return data
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as URLError {
            if error.code == .cancelled { throw CancellationError() }
            throw CatalogError.network(error.code)
        }
    }
}

extension URL {
    var isAllowedCatalogAPIBaseURL: Bool {
        guard let scheme, let host else { return false }
        if scheme == "https" { return true }
        return scheme == "http" && ["127.0.0.1", "localhost", "::1"].contains(host)
    }
}

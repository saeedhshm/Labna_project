import Foundation

struct LocalJSONDataSource: CatalogDataSource {
    let bundle: Bundle

    init(bundle: Bundle = .main) {
        self.bundle = bundle
    }

    func data(for resource: CatalogResource) async throws -> Data {
        try Task.checkCancellation()
        guard let url = bundle.url(forResource: resource.rawValue, withExtension: "json") else {
            throw CatalogError.missingResource(resource)
        }
        // Read resources off the main actor, even though the bundled fixtures are small.
        let read = Task.detached { try Data(contentsOf: url) }
        return try await withTaskCancellationHandler {
            do {
                let data = try await read.value
                try Task.checkCancellation()
                return data
            } catch is CancellationError {
                throw CancellationError()
            } catch {
                throw CatalogError.unreadableResource(resource)
            }
        } onCancel: {
            read.cancel()
        }
    }
}

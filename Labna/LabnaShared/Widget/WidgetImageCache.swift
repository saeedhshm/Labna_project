import Foundation

/// Caches the featured product image inside the App Group so the widget can
/// render without network access and without blocking on a request.
nonisolated protocol WidgetImageCaching: Sendable {
    func store(_ data: Data, named name: String) throws
    func data(named name: String) -> Data?
}

struct WidgetImageFileCache: WidgetImageCaching {
    private let directory: URL?

    init(directory: URL? = WidgetImageFileCache.defaultDirectory) {
        self.directory = directory
    }

    static var defaultDirectory: URL? {
        AppGroup.containerURL?.appendingPathComponent("WidgetImages", isDirectory: true)
    }

    func store(_ data: Data, named name: String) throws {
        guard let directory else { return }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try data.write(to: directory.appendingPathComponent(name), options: .atomic)
    }

    func data(named name: String) -> Data? {
        guard let directory else { return nil }
        return try? Data(contentsOf: directory.appendingPathComponent(name))
    }
}

import Foundation

/// Abstraction over the App Group storage used to hand widget data from the app
/// to the extension. Tests substitute an in-memory implementation, so they never
/// depend on a provisioned App Group.
nonisolated protocol WidgetSharedStoring: Sendable {
    func load() -> WidgetSharedState?
    func save(_ state: WidgetSharedState) throws
}

/// `UserDefaults`-backed store living in the shared App Group.
///
/// Falls back to the process defaults when the App Group is unavailable so
/// previews, unit tests and unsigned builds keep working instead of crashing.
final class WidgetSharedDefaultsStore: WidgetSharedStoring, @unchecked Sendable {
    static let stateKey = "labna.widget.sharedState"

    private let defaults: UserDefaults
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(defaults: UserDefaults? = UserDefaults(suiteName: AppGroup.identifier)) {
        self.defaults = defaults ?? .standard
    }

    func load() -> WidgetSharedState? {
        guard let data = defaults.data(forKey: Self.stateKey) else { return nil }
        return try? decoder.decode(WidgetSharedState.self, from: data)
    }

    func save(_ state: WidgetSharedState) throws {
        let data = try encoder.encode(state)
        defaults.set(data, forKey: Self.stateKey)
    }
}

/// In-memory store for tests and SwiftUI previews.
final class InMemoryWidgetSharedStore: WidgetSharedStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var state: WidgetSharedState?
    private var errorToThrow: (any Error)?

    init(state: WidgetSharedState? = nil) {
        self.state = state
    }

    var savedState: WidgetSharedState? {
        lock.withLock { state }
    }

    func fail(with error: any Error) {
        lock.withLock { errorToThrow = error }
    }

    func load() -> WidgetSharedState? {
        lock.withLock { state }
    }

    func save(_ state: WidgetSharedState) throws {
        if let errorToThrow {
            throw errorToThrow
        }
        lock.withLock { self.state = state }
    }
}

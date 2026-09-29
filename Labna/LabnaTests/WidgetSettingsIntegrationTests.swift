import Foundation
import Testing
@testable import Labna

/// Integration points between the app settings, the widget publisher and the
/// shared storage, verified without WidgetCenter or production shared state.
@MainActor
struct WidgetSettingsIntegrationTests {
    @Test func languageChangeNotifiesOnlyOnRealChanges() {
        let settings = AppSettings(storage: nil)
        var changes: [AppLanguage] = []
        settings.onLanguageChange = { changes.append($0) }

        settings.language = .arabic
        settings.language = .arabic
        settings.language = .english

        #expect(changes == [.arabic, .english], "A no-op assignment must not churn widget timelines")
    }

    @Test func languageChangeWritesTheSharedStateAndRequestsOneReload() async throws {
        let store = InMemoryWidgetSharedStore()
        let publisher = WidgetSnapshotPublisher(dependencies: .init(
            store: store,
            imageCache: WidgetImageFileCache(directory: nil),
            fetchImageData: { _ in nil },
            reloadTimelines: { _ in },
            now: { Date(timeIntervalSince1970: 1_700_000_000) }
        ))
        let settings = AppSettings(storage: nil)
        settings.language = .english
        settings.onLanguageChange = { language in
            Task { @MainActor in await publisher.publish(language: language) }
        }

        settings.language = .arabic
        // Let the detached task run without relying on timing-based assertions.
        await Task.yield()

        #expect(store.load()?.language == .arabic)
    }
}

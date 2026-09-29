import Foundation
import SwiftUI
import WidgetKit

/// Everything the widget needs to render, already resolved for one language.
struct FeaturedProductEntry: TimelineEntry {
    let date: Date
    let language: AppLanguage
    let product: WidgetProductSnapshot?
    let imageData: Data?

    /// Deep link used by `.widgetURL`, so a widget tap reuses the app's own
    /// `DeepLink` system instead of widget specific navigation.
    var deepLinkURL: URL? {
        product.flatMap { DeepLinkURLBuilder.url(for: .product(id: $0.id)) }
    }
}

/// Pure timeline logic, kept separate from `TimelineProvider` because
/// `TimelineProvider.Context` can only be created by a widget host. This makes
/// placeholder, snapshot and timeline behaviour unit testable.
struct FeaturedProductTimeline {
    /// Far future refresh: the app requests reloads with
    /// `WidgetCenter.reloadTimelines(ofKind:)`, so the widget never polls.
    static let refreshInterval: TimeInterval = 6 * 60 * 60

    /// When the timeline asks to be re-evaluated. Exposed so the strategy can be
    /// asserted without pattern matching WidgetKit's opaque reload policy.
    static func refreshDate(after date: Date) -> Date {
        date.addingTimeInterval(refreshInterval)
    }

    private static let placeholderProduct = WidgetProductSnapshot(
        id: "milk-full",
        nameAR: "لبن كامل الدسم",
        nameEN: "Full Cream Milk",
        priceMinor: 4500,
        currencyCode: "EGP",
        imageURL: nil,
        cachedImageName: nil,
        updatedAt: Date(timeIntervalSince1970: 1_700_000_000)
    )

    private let loadState: @Sendable () -> WidgetSharedState?
    private let loadImage: @Sendable (String) -> Data?

    init(
        loadState: @escaping @Sendable () -> WidgetSharedState? = { WidgetSharedDefaultsStore().load() },
        loadImage: @escaping @Sendable (String) -> Data? = { WidgetImageFileCache().data(named: $0) }
    ) {
        self.loadState = loadState
        self.loadImage = loadImage
    }

    /// Gallery and redraw placeholders always show realistic Labna data.
    func placeholderEntry(at date: Date) -> FeaturedProductEntry {
        FeaturedProductEntry(
            date: date,
            language: .english,
            product: Self.placeholderProduct,
            imageData: nil
        )
    }

    func snapshotEntry(isPreview: Bool, at date: Date) -> FeaturedProductEntry {
        guard !isPreview else { return placeholderEntry(at: date) }
        return entry(for: loadState() ?? emptyState, at: date)
    }

    func timeline(at date: Date) -> Timeline<FeaturedProductEntry> {
        Timeline(
            entries: [entry(for: loadState() ?? emptyState, at: date)],
            policy: .after(Self.refreshDate(after: date))
        )
    }

    private func entry(for state: WidgetSharedState, at date: Date) -> FeaturedProductEntry {
        FeaturedProductEntry(
            date: date,
            language: state.language,
            product: state.featuredProduct,
            imageData: state.featuredProduct?.cachedImageName.flatMap(loadImage)
        )
    }

    private var emptyState: WidgetSharedState {
        WidgetSharedState(
            language: WidgetSharedState.fallbackLanguage,
            featuredProduct: nil,
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
    }
}

/// Reads the published App Group snapshot. Storage and image reading are
/// injected, so the Widget Gallery and previews never depend on production data.
struct FeaturedProductProvider: TimelineProvider {
    private let timeline: FeaturedProductTimeline
    private let now: @Sendable () -> Date

    init(
        loadState: @escaping @Sendable () -> WidgetSharedState? = { WidgetSharedDefaultsStore().load() },
        loadImage: @escaping @Sendable (String) -> Data? = { WidgetImageFileCache().data(named: $0) },
        now: @escaping @Sendable () -> Date = Date.init
    ) {
        self.timeline = FeaturedProductTimeline(loadState: loadState, loadImage: loadImage)
        self.now = now
    }

    func placeholder(in context: Context) -> FeaturedProductEntry {
        timeline.placeholderEntry(at: now())
    }

    func getSnapshot(in context: Context, completion: @escaping (FeaturedProductEntry) -> Void) {
        completion(timeline.snapshotEntry(isPreview: context.isPreview, at: now()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FeaturedProductEntry>) -> Void) {
        completion(timeline.timeline(at: now()))
    }
}

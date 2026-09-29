import Foundation
import Observation

/// Publishes a lightweight snapshot of the current featured product into the
/// App Group and asks WidgetKit for a timeline reload.
///
/// This is the only place that writes shared widget storage, so screens never
/// touch it directly. All side effects (image download, timeline reload) are
/// injected, which keeps the publisher deterministic under test.
@MainActor
@Observable
final class WidgetSnapshotPublisher {
    struct Dependencies {
        let store: any WidgetSharedStoring
        let imageCache: any WidgetImageCaching
        let fetchImageData: @Sendable (URL) async -> Data?
        let reloadTimelines: @Sendable (String) -> Void
        let now: @Sendable () -> Date

        init(
            store: any WidgetSharedStoring,
            imageCache: any WidgetImageCaching,
            fetchImageData: @escaping @Sendable (URL) async -> Data?,
            reloadTimelines: @escaping @Sendable (String) -> Void,
            now: @escaping @Sendable () -> Date = Date.init
        ) {
            self.store = store
            self.imageCache = imageCache
            self.fetchImageData = fetchImageData
            self.reloadTimelines = reloadTimelines
            self.now = now
        }
    }

    static let widgetKind = LabnaWidgetKind.featuredProduct
    static let imageName = "featured-product.jpg"

    private let dependencies: Dependencies
    private var lastSignature: String?
    private var publishedLanguage: AppLanguage?
    private(set) var isPublishing = false

    init(dependencies: Dependencies) {
        self.dependencies = dependencies
    }

    /// Deterministic featured selection: the first product the catalog marks as
    /// featured that can actually be bought. Catalog order is stable, so the
    /// widget does not flip between equivalent candidates.
    static func featuredProduct(in products: [Product]) -> Product? {
        products.first { $0.isFeatured && $0.isAvailable }
    }

    static func snapshot(for product: Product, imageName: String?, now: Date) -> WidgetProductSnapshot? {
        guard let priceMinor = product.startingPriceMinor,
              let currencyCode = product.variants.first(where: \.isAvailable)?.currencyCode else {
            return nil
        }
        return WidgetProductSnapshot(
            id: product.id,
            nameAR: product.name.ar,
            nameEN: product.name.en,
            priceMinor: priceMinor,
            currencyCode: currencyCode,
            imageURL: product.imageURLs.first,
            cachedImageName: imageName,
            updatedAt: now
        )
    }

    /// Called after every catalog publish and after a language change.
    func publish(snapshot: CatalogSnapshot, language: AppLanguage) async {
        let featured = Self.featuredProduct(in: snapshot.products)
        await publish(product: featured, language: language, forceLanguageOnly: false)
    }

    /// Language-only refresh: no image work, no new timeline unless the
    /// rendered language actually changed.
    func publish(language: AppLanguage) async {
        await publish(product: nil, language: language, forceLanguageOnly: true)
    }

    private func publish(product: Product?, language: AppLanguage, forceLanguageOnly: Bool) async {
        isPublishing = true
        defer { isPublishing = false }

        let previous = dependencies.store.load()
        let previousSignature = previous?.signature

        let imageName = await cachedImageName(for: product, previous: previous)
        // A language-only refresh keeps the published product; a catalog publish
        // without a featured product clears it.
        let newSnapshot = product.flatMap { Self.snapshot(for: $0, imageName: imageName, now: dependencies.now()) }
            ?? (forceLanguageOnly ? previous?.featuredProduct : nil)
        let state = WidgetSharedState(language: language, featuredProduct: newSnapshot, updatedAt: dependencies.now())

        let languageOnly = forceLanguageOnly && previous?.featuredProduct?.id == newSnapshot?.id
        let signature = state.signature
        guard signature != previousSignature || previous == nil || languageOnly else {
            publishedLanguage = language
            return
        }

        do {
            try dependencies.store.save(state)
        } catch {
            // A failed write must not break the app; the widget keeps its last data.
            return
        }

        if signature != lastSignature || languageOnly {
            lastSignature = signature
            publishedLanguage = language
            dependencies.reloadTimelines(Self.widgetKind)
        }
    }

    private func cachedImageName(for product: Product?, previous: WidgetSharedState?) async -> String? {
        guard let product, let remote = product.imageURLs.first else {
            return previous?.featuredProduct?.id == product?.id
                ? previous?.featuredProduct?.cachedImageName
                : nil
        }
        if let cached = previous?.featuredProduct,
           cached.id == product.id,
           cached.imageURL == remote,
           cached.cachedImageName != nil,
           dependencies.imageCache.data(named: cached.cachedImageName ?? "") != nil {
            return cached.cachedImageName
        }
        guard let data = await dependencies.fetchImageData(remote), !data.isEmpty else { return nil }
        do {
            try dependencies.imageCache.store(data, named: Self.imageName)
            return Self.imageName
        } catch {
            return nil
        }
    }
}

import Foundation
import Testing
import WidgetKit
@testable import Labna

@MainActor
struct FeaturedProductProviderTests {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func snapshot(
        id: String = "milk-full",
        cachedImageName: String? = nil
    ) -> WidgetProductSnapshot {
        WidgetProductSnapshot(
            id: id,
            nameAR: "لبن كامل الدسم",
            nameEN: "Full Cream Milk",
            priceMinor: 4500,
            currencyCode: "EGP",
            imageURL: URL(string: "https://example.com/milk.jpg"),
            cachedImageName: cachedImageName,
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
    }

    private func timeline(
        state: WidgetSharedState?,
        image: Data? = nil
    ) -> FeaturedProductTimeline {
        FeaturedProductTimeline(
            loadState: { state },
            loadImage: { _ in image }
        )
    }

    // MARK: - Placeholder

    @Test func placeholderRendersWithoutSharedDataOrNetwork() {
        let entry = timeline(state: nil).placeholderEntry(at: now)

        #expect(entry.product != nil, "The gallery always shows a realistic product")
        #expect(entry.product?.nameEN == "Full Cream Milk")
        #expect(entry.deepLinkURL?.absoluteString == "labna://product/milk-full")
        #expect(entry.imageData == nil)
    }

    // MARK: - Snapshot

    @Test func previewSnapshotIgnoresProductionStorage() {
        let shared = WidgetSharedState(language: .arabic, featuredProduct: snapshot(id: "yogurt-greek"), updatedAt: now)
        let entry = timeline(state: shared).snapshotEntry(isPreview: true, at: now)

        #expect(entry.product?.id == "milk-full", "Preview mode must not read real data")
    }

    @Test func snapshotFallsBackWhenNoDataWasEverPublished() {
        let entry = timeline(state: nil).snapshotEntry(isPreview: false, at: now)

        #expect(entry.product == nil, "The widget renders its placeholder state")
        #expect(entry.language == WidgetSharedState.fallbackLanguage)
        #expect(entry.deepLinkURL == nil)
    }

    @Test func snapshotUsesSharedStateLanguageAndCachedImage() {
        let state = WidgetSharedState(
            language: .arabic,
            featuredProduct: snapshot(cachedImageName: "featured-product.jpg"),
            updatedAt: now
        )
        let entry = timeline(state: state, image: Data([0x01, 0x02])).snapshotEntry(isPreview: false, at: now)

        #expect(entry.language == .arabic)
        #expect(entry.product?.nameAR == "لبن كامل الدسم")
        #expect(entry.imageData == Data([0x01, 0x02]))
        #expect(entry.deepLinkURL?.absoluteString == "labna://product/milk-full")
    }

    @Test func snapshotWithoutACachedImageStillRendersTheProduct() {
        let state = WidgetSharedState(language: .english, featuredProduct: snapshot(), updatedAt: now)
        let entry = timeline(state: state, image: nil).snapshotEntry(isPreview: false, at: now)

        #expect(entry.product != nil)
        #expect(entry.imageData == nil, "The branded placeholder covers the missing image")
    }

    // MARK: - Timeline

    @Test func timelineRendersPublishedDataWithoutPolling() {
        let state = WidgetSharedState(language: .english, featuredProduct: snapshot(), updatedAt: now)
        let result = timeline(state: state).timeline(at: now)

        #expect(result.entries.count == 1, "A single entry, never a repeating series")
        #expect(result.entries[0].product?.id == "milk-full")

        #expect(FeaturedProductTimeline.refreshDate(after: now) == now.addingTimeInterval(6 * 60 * 60),
                "Reloads are requested by the app, not by a fast repeating timer")
        #expect(FeaturedProductTimeline.refreshDate(after: now).timeIntervalSince(now) >= 3600)
    }

    @Test func timelineFallsBackGracefullyWithoutSharedData() {
        let result = timeline(state: nil).timeline(at: now)

        #expect(result.entries.count == 1)
        #expect(result.entries[0].product == nil)
        #expect(result.entries[0].language == WidgetSharedState.fallbackLanguage)
    }

    // MARK: - Widget URL

    @Test func deepLinkURLMatchesTheSharedURLBuilder() throws {
        let entry = FeaturedProductEntry(date: now, language: .english, product: snapshot(), imageData: nil)
        let url = try #require(entry.deepLinkURL)
        #expect(url == DeepLinkURLBuilder.url(for: .product(id: "milk-full")))
        #expect(DeepLinkParser().parse(url) == .product(id: "milk-full"))
    }
}

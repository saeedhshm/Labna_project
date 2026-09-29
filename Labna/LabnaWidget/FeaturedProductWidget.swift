import SwiftUI
import WidgetKit

struct FeaturedProductWidget: Widget {
    static let kind = LabnaWidgetKind.featuredProduct

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Self.kind, provider: FeaturedProductProvider()) { entry in
            FeaturedProductWidgetContainer(entry: entry)
        }
        .configurationDisplayName("widget.displayName")
        .description("widget.description")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

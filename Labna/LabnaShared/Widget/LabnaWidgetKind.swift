import Foundation

/// Widget kind identifiers.
///
/// The app and the extension are separate processes, so the kind string lives in
/// the shared module to guarantee `reloadTimelines(ofKind:)` matches exactly.
enum LabnaWidgetKind {
    nonisolated static let featuredProduct = "LabnaFeaturedProductWidget"
}

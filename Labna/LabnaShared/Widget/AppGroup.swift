import Foundation

/// The App Group shared by the app and its widget extension.
///
/// The identifier is derived from the project's real bundle identifier
/// (`com.saeed.Labna`) so it matches the provisioning profile in use.
enum AppGroup {
    nonisolated static let identifier = "group.com.saeed.Labna"

    /// Container directory for shared files, or `nil` when the group is not
    /// available (for example an unsigned build or a unit test host).
    nonisolated static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: identifier)
    }
}

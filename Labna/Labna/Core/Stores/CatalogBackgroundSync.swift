import BackgroundTasks
import Foundation

@MainActor
final class CatalogBackgroundSync {
    static let taskIdentifier = "com.saeed.Labna.catalog.refresh"

    private let syncService: CatalogSyncService
    private let minimumRefreshInterval: TimeInterval
    private var isRegistered = false

    init(syncService: CatalogSyncService, minimumRefreshInterval: TimeInterval = 60 * 60) {
        self.syncService = syncService
        self.minimumRefreshInterval = minimumRefreshInterval
    }

    func register() {
        guard !isRegistered else { return }
        isRegistered = BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.taskIdentifier, using: nil) { [weak self] task in
            guard let self, let refreshTask = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            Task { @MainActor in
                self.handle(refreshTask)
            }
        }
    }

    func scheduleNextRefresh() {
        guard syncService.canRefreshRemote else { return }
        let request = BGAppRefreshTaskRequest(identifier: Self.taskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: minimumRefreshInterval)
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            // Background refresh is an optimization. Foreground stale-while-revalidate remains primary.
        }
    }

    private func handle(_ task: BGAppRefreshTask) {
        scheduleNextRefresh()
        let operation = Task { @MainActor in
            do {
                _ = try await syncService.refreshRemote()
                task.setTaskCompleted(success: true)
            } catch is CancellationError {
                task.setTaskCompleted(success: false)
            } catch {
                task.setTaskCompleted(success: false)
            }
        }
        task.expirationHandler = {
            operation.cancel()
        }
    }
}

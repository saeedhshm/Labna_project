//
//  LabnaApp.swift
//  Labna
//
//  Created by DEV-SAEEDHASHIM on 27/09/2026.
//

import SwiftUI

@main
struct LabnaApp: App {
    @State private var container: AppContainer

    init() {
        let container: AppContainer
#if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-simulateCatalogOffline") {
            container = AppContainer(repository: OfflineCatalogRepository())
        } else {
            container = AppContainer()
        }
#else
        container = AppContainer()
#endif
        if ProcessInfo.processInfo.arguments.contains("-resetCart") {
            container.cart.removeAll()
        }
        container.backgroundSync.register()
        container.backgroundSync.scheduleNextRefresh()
        _container = State(initialValue: container)
    }

    var body: some Scene {
        WindowGroup {
            AppRootView(container: container)
        }
    }
}

#if DEBUG
@MainActor
private struct OfflineCatalogRepository: CatalogRepository {
    private func offline<T>() throws -> T {
        throw CatalogError.network(.notConnectedToInternet)
    }

    func fetchProducts() async throws -> [Product] { try offline() }
    func fetchCategories() async throws -> [Category] { try offline() }
    func fetchBanners() async throws -> [Banner] { try offline() }
    func fetchBranches() async throws -> [Branch] { try offline() }
}
#endif

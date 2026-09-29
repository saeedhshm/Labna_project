import SwiftUI

struct FavoritesView: View {
    @Environment(AppContainer.self) private var container
    @State private var selectedProduct: Product?
    @State private var quickAddProduct: Product?
    @State private var addedProductName: String?

    var body: some View {
        CatalogStateView(store: container.catalog) { snapshot in
            content(snapshot)
        }
        .navigationTitle("favorites.title")
        .navigationBarTitleDisplayMode(.large)
        .navigationDestination(item: $selectedProduct) { product in
            ProductDetailsView(product: product, language: language)
        }
        .sheet(item: $quickAddProduct) { product in
            QuickAddSheet(product: product, language: language) { name in
                addedProductName = name
            }
        }
        .addedToCartToast(productName: addedProductName) { addedProductName = nil }
    }

    private var language: AppLanguage { container.settings.language }

    private func content(_ snapshot: CatalogSnapshot) -> some View {
        let products = favoriteProducts(from: snapshot.products)
        return Group {
            if products.isEmpty {
                LabnaEmptyStateView(
                    title: "favorites.empty.title",
                    message: "favorites.empty.message",
                    symbol: "heart",
                    actionTitle: "favorites.browseProducts",
                    action: { container.router.show(.catalog) }
                )
                .padding(LabnaSpacing.large)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: LabnaSpacing.medium) {
                        if container.favorites.persistenceFailed {
                            Label("favorites.persistenceError", systemImage: "externaldrive.badge.exclamationmark")
                                .font(LabnaTypography.body)
                                .foregroundStyle(Color.orange)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(LabnaSpacing.medium)
                                .background(Color.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: LabnaRadius.medium))
                        }
                        ProductGrid(
                            products: products,
                            language: language,
                            onOpen: { selectedProduct = $0 },
                            onQuickAdd: { quickAddProduct = $0 }
                        )
                    }
                    .padding(LabnaSpacing.large)
                }
                .background(Color.labnaCream.opacity(0.25))
            }
        }
    }

    private func favoriteProducts(from products: [Product]) -> [Product] {
        let productsByID = Dictionary(uniqueKeysWithValues: products.map { ($0.id, $0) })
        return container.favorites.favoriteProductIDs.compactMap { productsByID[$0] }
    }
}

#Preview("Empty") {
    AppRootView(container: .preview(language: .english))
}

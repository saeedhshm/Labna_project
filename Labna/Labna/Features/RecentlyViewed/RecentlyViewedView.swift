import SwiftUI

struct RecentlyViewedView: View {
    @Environment(AppContainer.self) private var container
    @State private var quickAddProduct: Product?
    @State private var addedProductName: String?

    var body: some View {
        CatalogStateView(store: container.catalog) { snapshot in
            content(snapshot)
        }
        .navigationTitle("recentlyViewed.title")
        .navigationBarTitleDisplayMode(.large)
        .sheet(item: $quickAddProduct) { product in
            QuickAddSheet(product: product, language: language) { name in
                addedProductName = name
            }
        }
        .addedToCartToast(productName: addedProductName) { addedProductName = nil }
    }

    private var language: AppLanguage { container.settings.language }

    private func content(_ snapshot: CatalogSnapshot) -> some View {
        let products = recentlyViewedProducts(from: snapshot.products)
        return Group {
            if products.isEmpty {
                LabnaEmptyStateView(
                    title: "recentlyViewed.empty.title",
                    message: "recentlyViewed.empty.message",
                    symbol: "clock.arrow.circlepath",
                    actionTitle: "recentlyViewed.browseProducts",
                    action: { container.router.show(.catalog) }
                )
                .padding(LabnaSpacing.large)
            } else {
                ScrollView {
                    ProductGrid(
                        products: products,
                        language: language,
                        onOpen: { container.router.append(.product($0), on: .more) },
                        onQuickAdd: { quickAddProduct = $0 }
                    )
                    .padding(LabnaSpacing.large)
                }
                .background(Color.labnaCream.opacity(0.25))
            }
        }
    }

    private func recentlyViewedProducts(from products: [Product]) -> [Product] {
        let productsByID = Dictionary(uniqueKeysWithValues: products.map { ($0.id, $0) })
        return container.recentlyViewed.productIDs.compactMap { productsByID[$0] }
    }
}

#Preview("Recently Viewed") {
    AppRootView(container: .preview(language: .english))
}

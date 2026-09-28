import SwiftUI

struct HomeView: View {
    private enum Destination: Hashable {
        case product(Product)
        case category(String)
    }

    @Environment(AppContainer.self) private var container
    @State private var searchText = ""
    @State private var destination: Destination?
    @State private var quickAddProduct: Product?
    @State private var addedProductName: String?

    var body: some View {
        CatalogStateView(store: container.catalog) { snapshot in
            content(snapshot)
        }
        .navigationBarHidden(true)
        .navigationDestination(item: $destination) { destination in
            switch destination {
            case .product(let product):
                ProductDetailsView(product: product, language: language)
            case .category(let categoryID):
                CatalogView(initialCategoryID: categoryID)
            }
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
        ScrollView {
            LazyVStack(alignment: .leading, spacing: LabnaSpacing.extraLarge) {
                LabnaLogo()
                LabnaSearchField(text: $searchText)

                if searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    if let banner = snapshot.banners.first {
                        bannerView(banner, snapshot: snapshot)
                    }
                    categoriesSection(snapshot.categories)
                    productsSection(
                        title: "home.featured",
                        products: CatalogQuery.products(
                            from: snapshot.products.filter(\.isFeatured),
                            searchText: "",
                            categoryID: nil,
                            sort: .featured,
                            language: language
                        )
                    )
                } else {
                    let results = CatalogQuery.products(
                        from: snapshot.products,
                        searchText: searchText,
                        categoryID: nil,
                        sort: .featured,
                        language: language
                    )
                    if results.isEmpty {
                        LabnaEmptyStateView(
                            title: "search.empty.title",
                            message: "search.empty.message",
                            symbol: "magnifyingglass",
                            actionTitle: "search.clear",
                            action: { searchText = "" }
                        )
                        .frame(minHeight: 330)
                    } else {
                        productsSection(title: "search.results", products: results)
                    }
                }
            }
            .padding(.horizontal, LabnaSpacing.large)
            .padding(.top, LabnaSpacing.medium)
            .padding(.bottom, LabnaSpacing.extraLarge)
        }
        .background(Color.labnaCream.opacity(0.25))
    }

    private func bannerView(_ banner: Banner, snapshot: CatalogSnapshot) -> some View {
        Button {
            switch banner.destination.kind {
            case .product:
                if let product = snapshot.products.first(where: { $0.id == banner.destination.id }) {
                    destination = .product(product)
                }
            case .category:
                destination = .category(banner.destination.id)
            }
        } label: {
            ProductImage(url: banner.imageURL, aspectRatio: 1.65, allowsRetry: false)
                .overlay(alignment: .bottomLeading) {
                    LinearGradient(
                        colors: [.clear, .black.opacity(0.72)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .overlay(alignment: .bottomLeading) {
                        VStack(alignment: .leading, spacing: LabnaSpacing.extraSmall) {
                            Text(banner.title.value(for: language)).font(LabnaTypography.title)
                            Text(banner.subtitle.value(for: language)).font(LabnaTypography.body)
                        }
                        .foregroundStyle(Color.white)
                        .multilineTextAlignment(.leading)
                        .padding(LabnaSpacing.large)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: LabnaRadius.large))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(banner.title.value(for: language)), \(banner.subtitle.value(for: language))")
    }

    private func categoriesSection(_ categories: [Category]) -> some View {
        VStack(alignment: .leading, spacing: LabnaSpacing.medium) {
            sectionTitle("home.categories")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: LabnaSpacing.medium) {
                    ForEach(categories) { category in
                        CategoryCard(category: category, language: language) {
                            destination = .category(category.id)
                        }
                        .frame(width: 150)
                    }
                }
            }
            .contentMargins(.horizontal, 1, for: .scrollContent)
        }
    }

    private func productsSection(title: LocalizedStringKey, products: [Product]) -> some View {
        VStack(alignment: .leading, spacing: LabnaSpacing.medium) {
            sectionTitle(title)
            ProductGrid(
                products: products,
                language: language,
                onOpen: { destination = .product($0) },
                onQuickAdd: { quickAddProduct = $0 }
            )
        }
    }

    private func sectionTitle(_ key: LocalizedStringKey) -> some View {
        Text(key).font(LabnaTypography.brand).foregroundStyle(Color.labnaInk)
    }
}

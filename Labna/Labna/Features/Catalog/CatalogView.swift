import SwiftUI

struct CatalogView: View {
    @Environment(AppContainer.self) private var container
    @State private var searchText = ""
    @State private var selectedCategoryID: String?
    @State private var sort: ProductSortOption = .featured
    @State private var quickAddProduct: Product?
    @State private var addedProductName: String?

    init(initialCategoryID: String? = nil) {
        _selectedCategoryID = State(initialValue: initialCategoryID)
    }

    var body: some View {
        CatalogStateView(store: container.catalog) { snapshot in
            catalog(snapshot)
        }
        .navigationTitle("catalog.title")
        .navigationBarTitleDisplayMode(.large)
        .sheet(item: $quickAddProduct) { product in
            QuickAddSheet(product: product, language: language) { name in
                addedProductName = name
            }
        }
        .addedToCartToast(productName: addedProductName) { addedProductName = nil }
    }

    private var language: AppLanguage { container.settings.language }

    private func open(_ product: Product) {
        container.router.append(.product(product), on: .catalog)
    }

    private func catalog(_ snapshot: CatalogSnapshot) -> some View {
        let products = CatalogQuery.products(
            from: snapshot.products,
            searchText: searchText,
            categoryID: selectedCategoryID,
            sort: sort,
            language: language
        )
        return ScrollView {
            LazyVStack(alignment: .leading, spacing: LabnaSpacing.large) {
                LabnaSearchField(text: $searchText)
                categoryFilter(snapshot.categories)
                HStack {
                    Text("catalog.count \(products.count)")
                        .font(LabnaTypography.body)
                        .foregroundStyle(Color.labnaMuted)
                    Spacer()
                    Menu {
                        Picker("sort.title", selection: $sort) {
                            ForEach(ProductSortOption.allCases) { option in
                                Text(LocalizedStringKey(option.titleKey)).tag(option)
                            }
                        }
                    } label: {
                        Label(LocalizedStringKey(sort.titleKey), systemImage: "arrow.up.arrow.down")
                            .font(LabnaTypography.headline)
                    }
                }

                if products.isEmpty {
                    LabnaEmptyStateView(
                        title: "search.empty.title",
                        message: "search.empty.message",
                        symbol: "magnifyingglass",
                        actionTitle: "filters.clear",
                        action: {
                            searchText = ""
                            selectedCategoryID = nil
                        }
                    )
                    .frame(minHeight: 330)
                } else {
                    ProductGrid(
                        products: products,
                        language: language,
                        onOpen: { open($0) },
                        onQuickAdd: { quickAddProduct = $0 }
                    )
                }
            }
            .padding(.horizontal, LabnaSpacing.large)
            .padding(.bottom, LabnaSpacing.extraLarge)
        }
        .background(Color.labnaCream.opacity(0.25))
    }

    private func categoryFilter(_ categories: [Category]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: LabnaSpacing.small) {
                filterChip(title: String(localized: "category.all", locale: language.locale), id: nil)
                ForEach(categories) { category in
                    filterChip(title: category.name.value(for: language), id: category.id)
                }
            }
        }
        .contentMargins(.horizontal, 1, for: .scrollContent)
    }

    private func filterChip(title: String, id: String?) -> some View {
        let selected = selectedCategoryID == id
        return Button(title) { selectedCategoryID = id }
            .font(LabnaTypography.headline)
            .padding(.horizontal, LabnaSpacing.medium)
            .frame(minHeight: 44)
            .foregroundStyle(selected ? Color.white : Color.labnaGreen)
            .background(selected ? Color.labnaGreen : Color.white, in: Capsule())
            .overlay { Capsule().stroke(Color.labnaBorder) }
            .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

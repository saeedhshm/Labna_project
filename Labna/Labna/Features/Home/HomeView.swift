import SwiftUI

struct HomeView: View {
    private enum Destination: Hashable {
        case product(Product)
        case category(String)
    }

    private struct BannerPlaybackID: Hashable {
        let bannerIDs: [String]
        let selectedIndex: Int
        let reduceMotion: Bool
        let isActive: Bool
    }

    @Environment(AppContainer.self) private var container
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var searchText = ""
    @State private var destination: Destination?
    @State private var quickAddProduct: Product?
    @State private var addedProductName: String?
    @State private var selectedBannerIndex = 0
    @State private var isSearchExpanded = false

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

    @ViewBuilder
    private var homeHeader: some View {
        if isSearchExpanded {
            HStack(spacing: LabnaSpacing.small) {
                LabnaSearchField(text: $searchText, focusesOnAppear: true)
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        searchText = ""
                        isSearchExpanded = false
                    }
                } label: {
                    Image(systemName: "xmark")
                        .font(.headline)
                        .foregroundStyle(Color.labnaInk)
                        .frame(width: 44, height: 44)
                        .background(Color.white, in: Circle())
                        .overlay {
                            Circle().stroke(Color.labnaBorder, lineWidth: 1)
                        }
                }
                .accessibilityLabel("action.close")
            }
            .transition(.opacity.combined(with: .move(edge: .top)))
        } else {
            HStack(spacing: LabnaSpacing.medium) {
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        isSearchExpanded = true
                    }
                } label: {
                    Image(systemName: "magnifyingglass")
                        .font(.headline)
                        .foregroundStyle(Color.labnaInk)
                        .frame(width: 44, height: 44)
                        .background(Color.white, in: Circle())
                        .overlay {
                            Circle().stroke(Color.labnaBorder, lineWidth: 1)
                        }
                }
                .accessibilityLabel("search.prompt")
                .accessibilityIdentifier("home.search.open")

                LabnaLogo()
                Spacer(minLength: 0)
            }
            .transition(.opacity.combined(with: .move(edge: .top)))
        }
    }

    private func content(_ snapshot: CatalogSnapshot) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: LabnaSpacing.extraLarge) {
                homeHeader
                    .padding(.horizontal, LabnaSpacing.large)

                if searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    if !snapshot.banners.isEmpty {
                        bannerCarousel(snapshot.banners, snapshot: snapshot)
                    }
                    categoriesSection(snapshot.categories)
                        .padding(.horizontal, LabnaSpacing.large)
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
                    .padding(.horizontal, LabnaSpacing.large)
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
                        .padding(.horizontal, LabnaSpacing.large)
                    } else {
                        productsSection(title: "search.results", products: results)
                            .padding(.horizontal, LabnaSpacing.large)
                    }
                }
            }
            .padding(.top, LabnaSpacing.medium)
            .padding(.bottom, LabnaSpacing.extraLarge)
        }
        .background(Color.labnaCream.opacity(0.25))
    }

    private func bannerCarousel(_ banners: [Banner], snapshot: CatalogSnapshot) -> some View {
        TabView(selection: $selectedBannerIndex) {
            ForEach(Array(banners.enumerated()), id: \.offset) { index, banner in
                bannerView(banner, index: index, snapshot: snapshot)
                    .tag(index)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: banners.count > 1 ? .always : .never))
        .aspectRatio(1.65, contentMode: .fit)
        .task(id: BannerPlaybackID(
            bannerIDs: banners.map(\.id),
            selectedIndex: selectedBannerIndex,
            reduceMotion: reduceMotion,
            isActive: scenePhase == .active
        )) {
            selectedBannerIndex = min(selectedBannerIndex, banners.count - 1)
            guard banners.count > 1, !reduceMotion, scenePhase == .active else { return }
            do {
                try await Task.sleep(for: .seconds(5))
            } catch {
                return
            }
            withAnimation(.easeInOut(duration: 0.45)) {
                selectedBannerIndex = (selectedBannerIndex + 1) % banners.count
            }
        }
    }

    private func bannerView(_ banner: Banner, index: Int, snapshot: CatalogSnapshot) -> some View {
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
                        .padding(.bottom, LabnaSpacing.medium)
                    }
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(banner.title.value(for: language)), \(banner.subtitle.value(for: language))")
        .accessibilityIdentifier("banner.\(index).\(banner.id)")
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

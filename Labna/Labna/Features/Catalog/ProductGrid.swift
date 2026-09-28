import SwiftUI

struct ProductGrid: View {
    let products: [Product]
    let language: AppLanguage
    let onOpen: (Product) -> Void
    let onQuickAdd: (Product) -> Void

    private let columns = [GridItem(.adaptive(minimum: 155, maximum: 240), spacing: LabnaSpacing.medium)]

    var body: some View {
        LazyVGrid(columns: columns, spacing: LabnaSpacing.medium) {
            ForEach(products) { product in
                ProductCard(
                    product: product,
                    language: language,
                    openDetails: { onOpen(product) },
                    addToCart: { onQuickAdd(product) }
                )
            }
        }
    }
}

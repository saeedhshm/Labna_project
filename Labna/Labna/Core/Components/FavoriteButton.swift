import SwiftUI

struct FavoriteButton: View {
    let productID: String
    @Environment(AppContainer.self) private var container
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let isFavorite = container.favorites.isFavorite(productID: productID)
        Button {
            if reduceMotion {
                container.favorites.toggleFavorite(productID: productID)
            } else {
                withAnimation(.spring(response: 0.22, dampingFraction: 0.75)) {
                    container.favorites.toggleFavorite(productID: productID)
                }
            }
        } label: {
            Image(systemName: isFavorite ? "heart.fill" : "heart")
                .font(.headline)
                .foregroundStyle(isFavorite ? Color.labnaGreen : Color.labnaInk)
                .frame(width: 44, height: 44)
                .background(Color.white.opacity(0.94), in: Circle())
                .overlay { Circle().stroke(Color.labnaBorder, lineWidth: 1) }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(isFavorite ? "favorites.remove" : "favorites.add"))
        .accessibilityAddTraits(isFavorite ? [.isSelected] : [])
        .accessibilityIdentifier("favorite.\(productID)")
    }
}

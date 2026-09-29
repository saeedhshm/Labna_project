import Testing
@testable import Labna

@MainActor
struct FavoritesStoreTests {
    @Test func favoritesToggleAndPersistAcrossStoreInstances() {
        let container = PersistenceContainer.make(inMemory: true)
        let first = FavoritesStore(modelContainer: container)

        first.addFavorite(productID: "milk-full")
        first.addFavorite(productID: "milk-full")
        first.addFavorite(productID: "yogurt-greek")

        #expect(first.favoriteProductIDs == ["milk-full", "yogurt-greek"])
        #expect(first.isFavorite(productID: "milk-full"))

        let restored = FavoritesStore(modelContainer: container)
        #expect(restored.favoriteProductIDs == ["milk-full", "yogurt-greek"])

        restored.toggleFavorite(productID: "milk-full")
        restored.toggleFavorite(productID: "labneh-classic")

        let restoredAgain = FavoritesStore(modelContainer: container)
        #expect(restoredAgain.favoriteProductIDs == ["yogurt-greek", "labneh-classic"])
        #expect(!restoredAgain.isFavorite(productID: "milk-full"))
    }
}

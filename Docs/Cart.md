# السلة والحفظ المحلي — القسم السادس

## Storage

`PersistedCartItem` is a SwiftData model stored in the default application container. Its unique key combines product and variant IDs. `PersistenceContainer.make(inMemory:)` provides the production disk container and isolated in-memory containers for previews and tests.

Each row persists:

- Product and variant IDs.
- Quantity.
- Arabic and English product/variant snapshots.
- Unit price and currency at the latest addition.
- Creation date for stable restoration order.

Names remain displayable if a remote catalog later removes a product. `AppContainer` owns one shared `CartStore` and exposes the same `ModelContainer` to SwiftUI. Preview containers never write to disk.

## Cart behavior

- Adding the same product + variant merges quantity.
- Different variants remain separate rows.
- Adding an unavailable variant or a non-positive quantity is ignored.
- Quantity can be changed from 1 to 99. Setting zero through the store removes the row.
- Every mutation is synchronized to SwiftData immediately.
- The tab badge uses all stored units and updates through Observation.
- A persistence failure keeps the in-memory cart usable and displays a warning; it is cleared after the next successful save.

## Catalog review

The catalog loads at app startup, then `CartStore.review(using:)` resolves every restored row. CartView repeats review when the catalog snapshot changes. Rows are classified as:

- Available.
- Product removed from catalog.
- Variant removed from product.
- Variant currently unavailable.

Unavailable rows stay visible and removable, but quantity controls are disabled and their old price is excluded from the total. They are never silently deleted.

The persisted price is compared with the current available variant price. A changed price shows the old value struck through and the current value, and totals always use the current catalog price. Adding that variant again accepts the current price for the merged row.

## UI states

- Empty cart with the shared empty-state component.
- Product cards with image, bilingual snapshot fallback, pack, unit/subtotal, quantity controls and delete action.
- Availability and persistence warnings.
- Unit count and current payable total. A note explains when unavailable rows are excluded.

The primary cart action opens the section-seven review flow only when the cart has at least one available line and no unavailable lines.

## Verification

`CartStoreTests` covers SwiftData restoration across store instances, quantity persistence, deletion, totals, price changes, unavailable/removed products and variants, rejected unavailable additions, and quantity limits. The browsing UI test terminates and relaunches the app to verify that the cart survives before continuing through demo checkout.

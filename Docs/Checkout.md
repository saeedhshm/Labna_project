# إتمام الطلب التجريبي — القسم السابع

## Flow

`CartView` opens `CheckoutReviewView` for a final product, quantity and total review. The screen accepts optional notes but deliberately asks for no address, phone number or payment details. Both the review and success screens clearly state that no real order or payment is created.

`AppRouter` owns tab selection and the cart navigation path. It lets the success screen clear the checkout stack and move directly to Home or Products without coupling those screens to `TabView` implementation details.

## Confirmation

`DemoCheckoutStore` performs confirmation on the main actor:

- Rejects an empty cart.
- Rejects removed or unavailable products and variants.
- Rejects a cart containing inconsistent currencies.
- Ignores additional confirmation attempts while processing.
- Revalidates the cart after the simulated processing interval.
- Creates a local `DemoOrder` with a unique `DEMO-` reference.
- Snapshots bilingual product names, pack labels, current prices and quantities.
- Trims optional notes and omits an empty value.
- Clears persisted cart rows only after successful order creation.

The order itself is intentionally not persisted or sent to a server. It exists only for the current success screen.

## Success

`OrderSuccessView` displays the demo reference, immutable line snapshots, optional notes and total. Its actions reset navigation before moving to Home or Products. Returning to Cart shows the empty state after successful confirmation.

## Verification

`DemoCheckoutTests` covers successful snapshots and persisted-cart clearing, duplicate confirmation protection, unavailable-item rejection and empty-cart rejection. The end-to-end UI journey restores a previously persisted cart, reviews it, enters notes, confirms it, verifies the success reference and disclaimer, navigates to Products and confirms the cart is empty.

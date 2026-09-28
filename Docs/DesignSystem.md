# Labna Design System — القسم الرابع

الهوية الحالية Light-only: خلفيات بيضاء وكريمية، أخضر داكن للإجراءات، وحدود خفيفة بدل الظلال الثقيلة. `AppRootView` يثبت الوضع الفاتح. عند دعم الوضع الداكن مستقبلًا يجب تحويل الألوان إلى adaptive color assets أولًا.

## Foundations

- `LabnaTheme.swift`: color, spacing, radius and semantic typography tokens.
- Typography uses semantic system fonts and preserves Dynamic Type. Avoid fixed text sizes outside decorative symbols.
- `LabnaPrimaryButtonStyle`: main action, full width, 52pt minimum height.
- `LabnaSecondaryButtonStyle`: outlined secondary action.
- Both button styles include pressed and disabled states.
- Use `leading`/`trailing`, not left/right, to preserve RTL behavior.

## Components

- `LabnaSearchField`: bound search text, clear action, focus border, search keyboard behavior.
- `ProductImage`: fixed ratio, NukeUI loading/cache/failure/retry behavior.
- `CategoryCard`: image and localized category title.
- `ProductCard`: details action, localized name, starting/single price, unavailable state and separate add action.
- `VariantSelector`: 1–3 available/unavailable packs; uses `ViewThatFits` to move from a row to a column when space or text size requires it.
- `QuantityStepper`: defaults to 1...20, enforces bounds, 40pt circular controls inside a 48pt+ container, and announces actions to VoiceOver.
- `PriceText` and `PriceFormatter`: format integer minor units using currency code and current locale. Do not construct prices by string concatenation.
- `LabnaLoadingView`, `LabnaEmptyStateView`, `LabnaErrorStateView`: shared screen states. `CatalogStateView` composes loading/error states for repository consumers.
- `AddedToCartToast` and `addedToCartToast`: accessible, animated two-second confirmation. The owning screen stores the optional product name and clears it in the dismiss closure.

Cards intentionally expose separate details and add buttons instead of nesting buttons. The card's product image is decorative; its details button announces product name and price.

## Previews

Open `DesignSystemGallery.swift` to review:

- Arabic RTL.
- English LTR.
- Accessibility 3 Dynamic Type.
- Buttons, search, selector, quantity, price, cards and all screen states.

Preview fixtures are code-only examples and are not used by the app. Real UI screens should use data from `CatalogStore`.

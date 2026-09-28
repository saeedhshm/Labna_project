# Labna mock data — القسم الثاني

Files: `Labna/Labna/Resources/Data/`. Xcode's synchronized app group includes these JSON resources in the app bundle. The tests decode the actual bundled resources. Local/remote repositories are documented in `Docs/DataLayer.md`.

## Contract

- Root arrays: `products.json`, `categories.json`, `banners.json`, `branches.json`.
- 15 products, 5 categories, 2 banners, 2 illustrative branches.
- Localized text uses `{ "ar": "…", "en": "…" }`; interface translations remain in String Catalog.
- Stable IDs must be preserved when moving to an API. Each variant has its own globally unique ID.
- Each product has 1–3 variants. Quantities are integers in `g` or `ml`; translated labels can display kilograms/litres.
- `priceMinor` is an integer in piastres, currency `EGP`: 4500 means EGP 45.00.
- Availability is per variant. Product availability and starting price are derived from available variants; a sold-out product has no available starting price.
- Fixtures include single-pack products, three-pack products, an unavailable buffalo-milk pack and a completely unavailable Roumy cheese product.
- Banner destinations contain `kind` (`product` or `category`) and a valid `id`.
- Branch hours are local `HH:mm`, ISO weekdays Monday=1 through Sunday=7, with `Africa/Cairo` timezone. Current fixtures only contain same-day hours. Missing weekday entries can represent closed days in future data.
- Cart items reference product + variant IDs; their combined identity distinguishes packs. Quantities must be validated as positive by the future cart store.
- Demo orders retain immutable translated names, labels and prices. Totals are derived from integer line amounts. Persistence can choose an explicit date encoding strategy when implemented.

## الصور والبيانات التجريبية

كل الأسعار والمكونات ومواعيد ومواقع الفروع توضيحية وليست بيانات متجر فعلي. المنتجات والفروع تحمل `isDemo: true`. لا توجد أرقام هاتف وهمية؛ القيم `null`.

الصور روابط مباشرة من Unsplash وليست صور عبوات لبنة. يعاد استخدام صور عامة للأقسام؛ صورة الحلوى/الزبادي مؤقتة للقشطة والكريمة، وصورة الجبن عامة وليست تمثيلًا دقيقًا لكل نوع. هي مناسبة للمراجعة الداخلية وTestFlight التجريبي فقط، وليست معتمدة كصور نهائية للمتجر. يجب استبدالها بصور المنتجات الفعلية أو إعادة اعتماد الترخيص والتمثيل البصري قبل نشر App Store.

Image sources (append `?auto=format&fit=crop&w=800&q=80` for the current catalog size):

- Milk: https://images.unsplash.com/photo-1563636619-e9143da7973b
- Cheese: https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d
- Yogurt/dessert placeholder: https://images.unsplash.com/photo-1488477181946-6428a0291777
- Butter: https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d

صفحات المصدر التي يجب مراجعتها مع شروط Unsplash الحالية قبل أي نشر عام:

- https://unsplash.com/photos/e9143da7973b
- https://unsplash.com/photos/6428a0291777
- https://unsplash.com/photos/eb2a19b0a32d
- https://unsplash.com/photos/4b7bb135bc9d
- https://unsplash.com/license

لا يحتوي المستودع على إثبات ترخيص منفصل أو موافقات علامات تجارية لهذه الصور. قرار التسليم الحالي: السماح بها في النسخة التجريبية الموسومة بوضوح، ومنع اعتبارها أصول إنتاج نهائية.

الكتالوج نفسه محلي؛ تحميل الصور يحتاج إنترنت. اختبارات البيانات تتحقق من روابط HTTPS دون الاتصال بالإنترنت حتى تظل قابلة للتكرار.

## Editing

1. Add translations and a stable product/category ID.
2. Add 1–3 variants with positive price/quantity, unique IDs and EGP currency.
3. Update banner references when removing a destination.
4. Run `MockDataTests` in Xcode to verify bundling, decoding, relationships, translations and model round trips.

Models use `Codable` without SwiftData or networking dependencies. A future API adapter can decode this same shape or map remote DTOs into these models.

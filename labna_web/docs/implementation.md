# Labna Web Demo — التشغيل وحدود التنفيذ

المشروع الآن Demo متجر إلكتروني كامل نسبيًا للـ CV: storefront + admin + API + MongoDB. المسار الأساسي المنفّذ:

```text
Customer register/login
-> Browse catalog
-> Add to cart
-> Checkout
-> Order created with server-side prices and inventory reservation
-> Admin sees order
-> Admin changes status
-> Customer refreshes tracking page
-> Dashboard shows MongoDB aggregation metrics
```

## لوحة الإدارة وواجهات API

لوحة React العربية متاحة على `http://localhost:5174`، متجر العملاء على `http://localhost:5175`، وAPI على `http://localhost:3001`. لتشغيل الخدمة من الصفر اتبع [README](../README.md).

## Demo Credentials

القيم تأتي من `.env`:

```text
Manager:  SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
Customer: SEED_CUSTOMER_EMAIL / SEED_CUSTOMER_PASSWORD
```

`npm run seed` ينشئ كتالوجًا ومخزونًا وعميلًا وطلبات demo بحالات: pending, confirmed, preparing, ready, out_for_delivery, completed, cancelled.

### 1. الدخول

`POST /api/v1/staff/auth/login`:
```json
{ "email": "your-manager-email", "password": "your-configured-password" }
```

استخدم قيمة `data.accessToken` كـ`Authorization: Bearer <token>` في الإدارة. لا تضع بيانات دخول فعلية في ملفات المشروع. الاستجابة تضبط refresh cookie خاصًا بالمصادقة. `/refresh` يتطلب `Origin` مسموحًا عند إرسال cookie، حتى عند الاختبار عبر Postman.

### 2. إنشاء فرع

`POST /api/v1/admin/branches`:
```json
{
  "id": "main",
  "name": {"ar":"الفرع الرئيسي","en":"Main branch"},
  "address": {"ar":"عنوان الفرع","en":"Branch address"},
  "coordinate": {"latitude":30.0444,"longitude":31.2357},
  "phoneNumber":null,
  "timeZoneIdentifier":"Africa/Cairo",
  "openingHours":[{"weekday":1,"opensAt":"09:00","closesAt":"21:00"}],
  "dateOverrides":[],
  "isVisible":true,
  "pickupEnabled":true,
  "acceptsOrders":true
}
```

الإحداثيات ومواعيد الاثنين في المثال للتوضيح؛ أدخل مواعيد وموقع الفرع الحقيقي. الأيام ISO: الاثنين 1 والأحد 7. اليوم غير المذكور مغلق. فترات منتصف الليل تُقسم بين يومين. dateOverrides لها صيغة `{date:"2026-12-25",intervals:[]}` لإغلاق استثنائي.

`PATCH /api/v1/admin/settings`:
```json
{"version":0,"defaultPickupBranchID":"main"}
```

استخدم version الحالي من GET settings إذا سبق التعديل. قبل تحديد الفرع الافتراضي، GET products بدون branchID يرجع `503 NO_PICKUP_BRANCH` ولا يختار فرعًا عشوائيًا.

### 3. إنشاء قسم ومنتج

`POST /api/v1/admin/categories`:
```json
{
  "id":"milk",
  "name":{"ar":"الحليب","en":"Milk"},
  "imageURL":"https://res.cloudinary.com/YOUR_CLOUD/image/upload/milk.png",
  "sortOrder":0
}
```

`POST /api/v1/admin/products`:
```json
{
  "id":"milk-full",
  "categoryID":"milk",
  "name":{"ar":"لبن كامل الدسم","en":"Full cream milk"},
  "description":{"ar":"وصف المنتج","en":"Product description"},
  "ingredients":{"ar":"لبن","en":"Milk"},
  "storageInstructions":{"ar":"يحفظ مبردًا","en":"Keep refrigerated"},
  "imageURLs":["https://res.cloudinary.com/YOUR_CLOUD/image/upload/milk.png"],
  "isFeatured":true,
  "publicationStatus":"published",
  "variants":[{
    "id":"milk-full-1l","sku":"MILK-FULL-1L",
    "label":{"ar":"١ لتر","en":"1 litre"},
    "quantity":1000,"unit":"ml","priceMinor":3500,"currencyCode":"EGP","isActive":true
  }]
}
```

استبدل URLs بروابط صور موجودة في مضيف مسموح. لا يقوم API بتنزيل الرابط أو التأكد من ملكية المورد في هذه المرحلة. `quantity` حجم العبوة، و`priceMinor` السعر بوحدات العملة الصغرى.

قراءة المتجر:
```text
GET /api/v1/products?branchID=main&locale=ar&sort=priceAsc
GET /api/v1/products/milk-full?branchID=main
```

إنشاء المنتج ينشئ inventory row بصفر؛ لذلك سيكون غير متوفر إلى حين إدخال جرد فعلي عبر `POST /api/v1/admin/inventory/adjustments`. كل تعديل يتطلب مفتاح idempotency ويسجل حركة.

### 4. التعديل والأرشفة

```text
PATCH /api/v1/admin/products/milk-full
{ "version": 0, "isFeatured": false }

DELETE /api/v1/admin/products/milk-full
{ "version": 1 }
```

version قديم =>409. الحذف أرشفة، ولا يمكن إعادة استخدام ID مؤرشف. variants لها IDs ثابتة؛ لتعطيل أحدها أرسل variants كاملة مع isActive=false، لا تحذف العنصر. القسم الذي لديه منتجات لا يُؤرشف، وفرع الاستلام الافتراضي يحتاج بديلًا أولًا.

## استيراد كتالوج iOS

`npm run seed` يستورد `seed/ios-catalog/`، وهي نسخة من `Labna/Labna/Resources/Data/*.json`، ليبقى مشروع الويب مستقلًا. حدّث النسخة بعد أي تعديل في التطبيق:

```bash
cp ../Labna/Labna/Resources/Data/{categories,products,banners,branches}.json seed/ios-catalog/
```

الاستيراد يمر عبر `catalog-service.ts` نفسه الذي تستخدمه مسارات HTTP، فتطبق القواعد نفسها: التحقق من المخططات، فحص المراجع، هوية الخيارات الثابتة، معاملة تزامنية، صفوف مخزون، وسجل تدقيق. السجل الموجود يُحدَّث بإصدار `version` التالي بدل إنشاء نسخة ثانية.

الفروق بين صيغتي iOS والـ API:

| iOS | API | المعالجة |
|---|---|---|
| `isAvailable` على الخيار | `isActive` | تُعكس القيمة؛ الخيار غير المتوفر في iOS يصبح معطّلًا ويُسجَّل كملاحظة |
| لا يوجد `sku` | `sku` مطلوب وفريد | يُشتق من معرّف الخيار بحروف كبيرة |
| لا يوجد `publicationStatus` | مطلوب | يُستورد `published` |
| `isDemo` | غير موجود | لا يُستورد؛ الكتالوج المستورد بيانات متجر حقيقية البنية |
| لا توجد أعلام فرع | `isVisible`, `pickupEnabled`, `acceptsOrders` | فرع ظاهر يدعم الاستلام ويقبل الطلبات |
| لا يوجد مخزون | `Inventory` | صفوف بأصفار، ثم `SEED_STOCK_ON_HAND` كث بيانات تجريبية |

توجد بيانات توضيحية في الملفات المصدرية تُستورد كما هي: فرعان يحملان `demo-` في المعرّف ونص «تجريبي» في الاسم، و`cheese-roumy` غير متاح في التطبيق. استبدلها ببيانات الفروع الفعلية قبل التشغيل التجاري.

## مسارات demo الرئيسية

## إدارة البنرات والفروع

نوع وجهة البانر أحد أربعة، والاختيار يتم من قائمة مبنية على بيانات الـ API لا بكتابة معرّف:

| `destination.kind` | الأثر في المتجر | التحقق |
|---|---|---|
| `product` | رابط داخلي `/products/:id` | المنتج يجب أن يكون منشورًا وغير مؤرشف |
| `category` | رابط داخلي `/categories/:id` | القسم يجب أن يكون موجودًا وغير مؤرشف |
| `external` | رابط خارجي في تبويب جديد مع `noopener noreferrer` | يجب أن يبدأ بـ `https` |
| `none` | بلا رابط وبلا زر | لا يحتاج مرجعًا |

`cta` اختياري ومترجم؛ تعرضه الواجهة عند وجوده وإلا تستخدم النص الافتراضي. التوسعة تمت كـ discriminated union على `kind`، فكل البنرات القديمة `{kind, id}` تبقى صالحة ولم يتغير شكل البيانات أو الـ seed. `external` و`none` لا تمنع أرشفة القسم أو المنتج المشار إليه.

الفروع: `isVisible` يتحكم في الظهور العام، و`pickupEnabled`/`acceptsOrders` في الاستلام. التحقق يرفض خط عرض أو طول خارج المدى، ورقم هاتف لا يطابق الصيغة الدولية، ومنطقة زمنية غير صالحة، وفترات متداخلة أو تعبر منتصف الليل. الإحداثيات والحقول الاختيارية الفارغة تُخفي التفاعل بدل إظهار رابط مكسور.

لوحة الإدارة تستخدم نفس نظام التصميم القائم: `Notice` للتنبيهات، وإضافة `ToastProvider` لرسائل النجاح/الخطأ. `FormDialog` يمنع الإرسال المكرّر عبر مرجع متزامن، لأن الإرسال المزدوج السريع يُنشئ سجلين في عملية `POST` التي لا تملك `version` يمنع التكرار.

### Storefront

```text
GET  /api/v1/categories
GET  /api/v1/products
GET  /api/v1/products/:id
POST /api/v1/cart/validate
POST /api/v1/orders
GET  /api/v1/orders/:id
POST /api/v1/customer/auth/register
POST /api/v1/customer/auth/login
GET  /api/v1/customer/me
POST /api/v1/customer/addresses
GET  /api/v1/customer/orders
```

### Admin

```text
POST  /api/v1/staff/auth/login
GET   /api/v1/admin/dashboard
GET   /api/v1/admin/orders
PATCH /api/v1/admin/orders/:id/status
GET   /api/v1/admin/inventory?lowStock=true
GET   /api/v1/admin/inventory?outOfStock=true
POST  /api/v1/admin/inventory/adjustments
```

السعر النهائي والمخزون لا يأتيان من الواجهة؛ `cart/validate` و`orders` يعيدان قراءة MongoDB. إتمام الطلب يحجز `reserved`، الإلغاء يحرره، والإكمال يخصم من `onHand` و`reserved`.

## ما تحقق بالفعل

اختبارات integration تنشئ MongoDB replica set مؤقتًا وتتحقق من:
- صلاحيات المدير، منع المشغل، وإبطال حساب موظف محظور.
- refresh rotation، رفض Origin غير مسموح، replay revocation، logout.
- تهيئة المخزون بصفر والتوفر من الفرع المحدد فقط.
- عدم ظهور draft/hidden وإخفاء بيانات الإدارة من DTOs العامة.
- البحث حرفيًا دون regex injection، filters، pagination وتغير ETag مع المخزون.
- فشل علاقات الكتالوج غير الصالحة، أرشفة آمنة وSKU/variant uniqueness.
- تحديثان بنفس version: نجاح واحد وتعارض الآخر، دون audit مزيف.
- المواعيد والعطلات وتوثيق OpenAPI الصحيح.
- اختبارات للوحة React تشمل سعر العبوة بالأرقام العربية ورفض إدخال سعر غير صالح قبل الإرسال، مواعيد الفروع والتعارض، واستعادة access token عبر refresh cookie بعد 401.
- تجربة تشغيل فعلية على MongoDB replica set: `npm run seed` استورد 5 أقسام و15 منتجًا و4 بنرات وفرعين و68 صف مخزون، ثم قرأتها الواجهة العامة ولوحة الإدارة. إعادة تشغيل `seed` حدّثت 26 سجلًا دون تكرار.
- الترتيب السعري يعرض المنتجات غير المتوفرة في النهاية ولا يستخدم سعر خيار معطّل؛ عند إيقاف فرع مؤقتًا للاستقبال يصبح التوفر صفرًا دون المساس بالمخزون المخزن.
- استجابة خطأ الإعداد تذكر اسم الحقل وطريقة توليد القيم المطلوبة بدل رسالة Zod عامة.
- رحلة order كاملة: checkout، حجز المخزون، ظهور الطلب في admin، تغيير الحالة، tracking في storefront، dashboard aggregation.
- حسابات العملاء والعناوين وMy Orders وReorder.

## الحدود والاختيارات المرحلية

- الخدمة تعمل كعملية واحدة؛ rate limits داخل الذاكرة. التوسع لعدة replicas يحتاج limiter مشترك وضبط proxy موثوق قبل النشر خلف load balancer.
- cursor موقّع مرتبط بالفلاتر وlimit، ويستخدم offset حتى 10,000. الفرز يحسم التعادل بـid؛ التعديلات أثناء التنقل قد تحرك الصفحات، ولا توجد snapshot guarantee.
- إدارة الكتالوج تستخدم قفل revision داخل معاملات MongoDB لتسلسل التعديلات المرتبطة. هذا مناسب للمتجر الحالي، وليس تصميمًا لأعداد ضخمة من الكتابات.
- payload الكتالوج داخل حقل `data` في MongoDB، مع strict Zod validation عند كل كتابة API. الـAPI يعرض DTO مسطحًا. لا تُكتب payloads مباشرة من خارج services.
- إدارة settings الحالية تعدل الفرع الافتراضي فقط. بيانات contact/policies تبقى فارغة.
- تصحيح في هذه المرحلة: السعر الابتدائي للترتيب والتصفية صار مشتقًا من الخيارات المتاحة فعلًا فقط، موافقةً مع `startingPriceMinor` في تطبيق iOS. قبل ذلك كان منتج بلا مخزون يظهر في أول قائمة السعر مع سعر خيار غير قابل للشراء.
- حماية أرشفة الفرع تفحص المخزون المحجوز. الطلبات المفتوحة تظهر في لوحة الطلبات، لكن لا توجد صفحة audit عامة.
- فرع acceptsOrders=false يرجع خيارات غير متاحة؛ إغلاق ساعات العمل وحده لا يوقف التوفر، بما يتوافق مع قبول الطلبات للمعالجة التالية.
- iOS لم يُربط بهذه الخدمة بعد؛ استجابات envelope وpagination تحتاج adapter. الملفات المحلية القديمة ما زالت تعمل.
- وثائق `backend-design.md` و`api-v1.md` تمثل الخطة الكاملة. المصدر الدقيق للمسارات الحالية هو `/api/v1/openapi.json`.
- لوحة الإدارة تعرض dashboard من MongoDB aggregation، وليس من البيانات المحمّلة في React.
- نموذج المنتجات يسمح بعدة روابط صور HTTPS ويحافظ على جميع الصور الموجودة عند التعديل. لا يوجد رفع صور في هذه المرحلة؛ الروابط يجب أن تأتي من `MEDIA_ORIGINS`.
- لوحة الإدارة تعتمد على refresh cookie خاص بالمسار `/api/v1/staff/auth` وaccess token في الذاكرة. يجب تشغيلها وAPI من نفس الأصل في الإنتاج عبر reverse proxy وHTTPS؛ `dist` وحده لا يوجه `/api`.
- Storefront يستخدم refresh cookie منفصلًا للعملاء ومسار `/api/v1/customer/auth`.
- الدفع mock فقط: `cash_on_delivery`, `demo_card_success`, `demo_card_failure`. لا توجد بوابة دفع حقيقية.
- رفع الصور غير منفذ؛ الصور روابط HTTPS من مضيفات `MEDIA_ORIGINS`.

# عقد API v1 — مسودة تصميم للتنفيذ

Base path: `/api/v1`. JSON UTF-8، HTTPS في النشر. المعرفات opaque strings، التواريخ ISO 8601 UTC، والمبالغ integer minor units. الحقول غير المعروفة في أوامر الكتابة تُرفض. حدود request body والتحقق تطبق على السيرفر.

## القواعد المشتركة

نجاح: `{ "data": ... , "meta": { "requestID": "..." } }`.

قائمة: `data: []`, و`meta: { requestID, nextCursor: string|null }`. `limit` الافتراضي 20، الأقصى 100؛ cursor opaque، والفرز ثابت مع id كفاصل تعادل. طلب cursor غير صالح =>400.

خطأ:
```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Requested quantity is unavailable",
    "details": [{ "variantID": "milk-full-1l", "availableQuantity": 2 }]
  },
  "meta": { "requestID": "req_123" }
}
```

HTTP: 400 طلب مشوه، 401 غير مسجل، 403 غير مسموح، 404 غير موجود/ليس ملك العميل، 409 تعارض، 422 حقول غير صالحة، 429 حد محاولات مع Retry-After. 500 لا يعرض stack traces.

كل write retryable للطلبات والمخزون والمزامنة يحمل `Idempotency-Key` UUID. الاحتفاظ بالنتيجة 30 يومًا؛ التكرار يعيد نفس status/body، اختلاف body =>409 IDEMPOTENCY_CONFLICT. لا يُعاد checkout تلقائيًا بعد انتهاء نافذة المفتاح؛ يُراجع سجل الطلبات أولًا.

PATCH الإداري يحمل `version`؛ التعارض =>409 VERSION_CONFLICT. لا PATCH عام لكائن Order أو Inventory يسمح بتجاوز قواعد العمل.

التصنيفات: **عام** دون جلسة، **عميل** جلسة customer، **موظف** manager/orderOperator، **مدير** manager فقط. كل endpoint خاص بالعميل مقيد بملكيته.

## 1. الدخول والحساب

| Method / path | الصلاحية | الطلب → data |
|---|---|---|
| POST /auth/otp/request | عام | `{phoneNumber}` بصيغة E.164 → `{challengeID, expiresAt, resendAfter}`؛ 202 |
| POST /auth/otp/verify | عام | `{challengeID, code, channel:web\|ios}` → `{customer, accessToken, expiresIn, refreshToken?}`؛ 200 |
| POST /auth/refresh | refresh session | cookie للويب أو `{refreshToken}` لـiOS → access جديد وrefresh دوّار |
| POST /auth/logout | session | إبطال الجلسة ومسح cookie → `{loggedOut:true}` |
| POST /auth/logout-all | عميل | إبطال كل جلسات الحساب → `{loggedOut:true}` |
| GET /me | عميل | Customer DTO |
| PATCH /me | عميل | `{name}` من 2–100 حرف → Customer DTO؛ تغيير الهاتف ليس ضمن v1 |
| POST /staff/auth/login | عام | `{email,password}` → access token وcookie refresh مستقل للموظفين |
| POST /staff/auth/refresh | staff refresh | تدوير جلسة موظف |
| POST /staff/auth/logout | staff session | إبطال جلسة موظف |

Customer DTO: `{id, phoneNumber, name:null|string, createdAt}`. إرسال رقم معروف أو جديد يعيد نفس صيغة challenge. name مطلوب قبل إنشاء الطلب. Bearer access مطلوب للواجهات الخاصة؛ refresh الخاص بالويب لا يظهر في JSON.

## 2. الكتالوج والفروع

| Method / path | Query | data |
|---|---|---|
| GET /store | — | `{currencyCode, defaultPickupBranchID, contact, policies, acceptOutsideHours}` |
| GET /categories | cursor,limit | Category[] |
| GET /banners | cursor,limit | Banner[] النشطة مرتبة |
| GET /products | branchID,categoryID,q,locale,featured,available,minPriceMinor,maxPriceMinor,sort,cursor,limit | Product[] |
| GET /products/:id | branchID | Product |
| GET /branches | cursor,limit | Branch[] الظاهرة |
| GET /branches/:id | — | Branch |

كلها عامة. branchID الافتراضي من إعدادات المتجر ويعاد كـmeta.branchID؛ عند إرسال فرع غير صالح يرجع 422 بدل استبداله صامتًا. sort: featured/priceAsc/priceDesc/name؛ locale: ar/en. الأسعار المستخدمة في sort هي أقل سعر خيار نشط. q حتى 100 حرف. الحقول والفرز whitelist لمنع تمرير Mongo operators.

Product DTO المتوافق مع iOS:
```json
{
  "id": "milk-full", "categoryID": "milk",
  "name": {"ar":"لبن كامل الدسم","en":"Full cream milk"},
  "description": {"ar":"وصف المنتج","en":"Product description"},
  "ingredients": {"ar":"لبن","en":"Milk"},
  "storageInstructions": {"ar":"يحفظ مبردًا","en":"Keep refrigerated"},
  "imageURLs": ["https://images.example.com/milk.png"],
  "isFeatured": true, "isDemo": false,
  "variants": [{
    "id":"milk-full-1l", "label":{"ar":"١ لتر","en":"1 litre"},
    "quantity":1000, "unit":"ml", "priceMinor":3500,
    "currencyCode":"EGP", "isAvailable":true, "availableQuantity":20
  }]
}
```

Category: `{id,name:{ar,en},imageURL,sortOrder}`.
Banner: `{id,title:{ar,en},subtitle:{ar,en},imageURL,destination:{kind:product|category,id},sortOrder}`.
Branch: `{id,name,address,coordinate:{latitude,longitude},timeZoneIdentifier,openingHours:[{weekday,opensAt,closesAt}],phoneNumber,isDemo:false,pickupEnabled,acceptsOrders,isOpen,nextOpensAt}`؛ name/address محليان، nextOpensAt nullable.

GET يدعم ETag/If-None-Match و304؛ ETag للمنتجات يشمل stock والفرع والفلاتر. لا cache مشترك للبيانات الخاصة. توفر الكتالوج إرشادي ويعاد فحصه وقت الطلب.

## 3. مراجعة وإنشاء الطلب

**POST /checkout/quote** — عميل، 200:
```json
{
  "branchID":"main",
  "items":[{"productID":"milk-full","variantID":"milk-full-1l","quantity":2}]
}
```

الكمية عدد صحيح 1–99، أقصى 50 خيارًا مختلفًا. بعد تجميع المكرر يطبق نفس الحد. data:
`{quoteToken, expiresAt, branch, lines, subtotalMinor, totalMinor, currencyCode, processingStartsAt, warnings}`.

quoteToken موقّع ومقيد بالعميل والفرع والخيارات والكميات والأسعار، صالح خمس دقائق، لا يحجز مخزونًا. warnings قد تحتوي OUTSIDE_OPENING_HOURS. lines تحمل أسماء وخيارات وأسعار snapshots. processingStartsAt يمثل بدء المعالجة المتوقع لا موعد الاستلام.

**POST /orders** — عميل، Idempotency-Key، 201:
```json
{
  "quoteToken":"signed-token",
  "paymentMethod":"cashOnPickup",
  "notes":"ملاحظة اختيارية حتى 500 حرف"
}
```

data = Order DTO. السيرفر يأخذ items من token الموثّق ويعيد التحقق. لا يقبل total أو customerID من العميل. الأخطاء: QUOTE_EXPIRED, PRICE_CHANGED, INSUFFICIENT_STOCK, BRANCH_NOT_ACCEPTING_ORDERS, PRODUCT_UNAVAILABLE (409)، PROFILE_INCOMPLETE (422). تغيير السعر يحتاج quote جديدًا وموافقة العميل، لا تأكيد صامت.

Order DTO:
`{id,number,customer:{name,phoneNumber},branchSnapshot,lines,subtotalMinor,totalMinor,currencyCode,status,paymentStatus,paymentMethod,notes,history:[{status,at}],createdAt,updatedAt,readyAt,collectedAt,version}`.

status: pendingConfirmation/confirmed/preparing/readyForPickup/collected/cancelled.
paymentStatus: unpaid/paid. collected يتطلب paid؛ العميل لا يعدل الدفع. التواريخ غير الحاصلة null. تفاصيل الموظفين الداخلية لا تظهر للعميل.

| Method / path | الطلب/الاستجابة |
|---|---|
| GET /me/orders | status,cursor,limit → طلبات العميل، الأحدث أولًا |
| GET /me/orders/:id | Order |
| POST /me/orders/:id/cancel | `{version,reason?}` + Idempotency-Key → Order؛ pendingConfirmation فقط |

## 4. المفضلة وسجل المشاهدة

**GET /me/sync-state** — عميل:
`{revision,historyGeneration,favoriteProductIDs,recentlyViewed:[{productID,lastViewedAt}],unavailableProductIDs}`.

**POST /me/sync** — عميل، Idempotency-Key:
```json
{
  "baseRevision":12,
  "historyGeneration":2,
  "operations":[
    {"operationID":"uuid-1","type":"favorite.add","productID":"milk-full"},
    {"operationID":"uuid-2","type":"view.record","productID":"milk-full","viewedAt":"2026-10-01T12:00:00Z"}
  ]
}
```

types: favorite.add/favorite.remove/view.record/history.clear. history.clear لا يحمل productID ويكون العملية الوحيدة بالدفعة. max 100 عملية؛ operationID فريد داخل الدفعة. الدفعة ذرية وتعيد sync-state كاملًا مع revision جديد. baseRevision قديم =>409 SYNC_CONFLICT مع state الحالي؛ historyGeneration قديم =>409 HISTORY_GENERATION_MISMATCH. يعاد إرسال نية المستخدم بعد المصالحة بمفتاح جديد، لا إعادة merge تلقائيًا.

أول دخول: جلب state ثم إرسال إضافات الزائر ومشاهداته مرة واحدة؛ تخزين علامة اكتمال الاستيراد محليًا للحساب. لا رفع بيانات حساب سابق.

## 5. أجهزة الإشعارات

| Method / path | عميل — الطلب |
|---|---|
| PUT /me/devices/:installationID | `{token,platform:ios,environment:sandbox|production}` → `{registered:true}` |
| DELETE /me/devices/:installationID | إزالة تسجيل الجهاز المملوك للعميل → `{removed:true}` |

ربط الجهاز بالحساب الحالي وإلغاء ارتباطه السابق بشكل آمن؛ لا إرسال تفاصيل طلبات الحساب القديم بعد تبديل الحساب. إشعارات الويب/SMS خارج الإصدار الأول؛ الويب يجلب حالة الطلب أثناء فتح الصفحة.

## 6. واجهات الإدارة

كل قوائم الإدارة تدعم cursor/limit. GET/:id وPATCH يرجعان DTO السجل؛ الإنشاء 201 والبقية 200. DELETE للأرشفة يرجع `{archived:true}`.

| Endpoints | الصلاحية | ملاحظات |
|---|---|---|
| GET /admin/overview | موظف | counts حسب حالة الطلب وcollectedRevenueMinor والفترة والفرع |
| GET /admin/orders ; GET /admin/orders/:id | موظف | تصفية status/paymentStatus/branchID/from/to/q، q لرقم الطلب/الهاتف |
| POST /admin/orders/:id/transition | موظف | `{version,toStatus,reason?,discardLines?:[{variantID,quantity}]}` + Idempotency-Key؛ الانتقالات الموضحة في التصميم |
| POST /admin/orders/:id/collect | موظف | `{version,receivedAmountMinor}` + Idempotency-Key؛ المبلغ يساوي الإجمالي، يسجل paid+collected ذريًا |
| GET /admin/inventory | موظف | branchID,variantID,lowStock |
| POST /admin/inventory/adjustments | مدير | `{branchID,variantID,onHandDelta,reason,version}` + Idempotency-Key → Inventory |
| GET /admin/inventory/movements | مدير | inventoryID,from,to |
| PATCH /admin/inventory/:id | مدير | `{version,lowStockThreshold}` فقط؛ لا تعديل reserved |
| GET /admin/customers ; GET /admin/customers/:id | مدير | بيانات الحساب؛ طلباته عبر customerID filter إداري |
| PATCH /admin/customers/:id/status | مدير | `{version,status:active|blocked,reason}`؛ الحظر يبطل الجلسات |
| GET/POST /admin/staff ; PATCH /admin/staff/:id | مدير | الاسم والبريد والدور والحالة؛ يمنع تعطيل آخر مدير نشط |
| GET/PATCH /admin/settings | مدير | currencyCode/defaultPickupBranchID/contact/policies/acceptOutsideHours مع version؛ تغيير العملة بعد الطلبات يتطلب migration خارج هذا endpoint |

transition لا يقبل collected؛ التحصيل عبر collect فقط. cancellation بعد التأكيد يتطلب discardLines صريحة لكل سطر ولو بصفر. الموظف لا يستطيع اختيار actorID من الطلب.

### CRUD الكتالوج — مدير فقط

لـ`products`, `categories`, `banners`, `branches`:
`GET /admin/{resource}`, `GET /admin/{resource}/:id`, `POST /admin/{resource}`, `PATCH /admin/{resource}/:id`, `DELETE /admin/{resource}/:id`.

حقول الإنشاء/التعديل:
- products: categoryID, name, description, ingredients, storageInstructions, imageURLs, isFeatured, publicationStatus, variants. السعر غير سالب، أسماء ar/en مطلوبة؛ variants لها IDs ثابتة وSKU وحجم/وحدة وسعر وحالة. variant مرتبط بمخزون/طلب يُعطل لا يحذف.
- categories: name, imageURL, sortOrder. أرشفة قسم بمنتجات منشورة =>409 حتى نقلها/أرشفتها.
- banners: title, subtitle, imageURL, destination, sortOrder, isActive. التحقق من وجود الهدف المنشور.
- branches: name, address, coordinate, phoneNumber, timeZoneIdentifier, openingHours, dateOverrides, isVisible, pickupEnabled, acceptsOrders. لا أرشفة فرع لديه طلبات مفتوحة أو هو الافتراضي قبل تعيين بديل.

تحديث publicationStatus/variant pricing يولّد version جديدًا للكتالوج. تفعيل variant/فرع لا ينشئ مخزونًا وهميًا؛ صف inventory يبدأ بصفر عبر خدمة الإدارة.

### الصور — مدير فقط

`POST /admin/media` multipart field `file`، JPEG/PNG/WebP فقط، حد 5MB، فحص المحتوى والأبعاد من الملف نفسه، حد 4096×4096. data `{id,url,width,height}` بعد الرفع. استخدام URLs من وسائط المتجر فقط في CRUD؛ لا تنزيل arbitrary URL على السيرفر.

`DELETE /admin/media/:id` يحذف وسيطًا غير مستخدم، وإلا 409 MEDIA_IN_USE. لا تقديم مفاتيح Cloudinary السرية للمتصفح.

## 7. ملاحظات التشغيل والتوثيق

- CORS بأصول معلومة، limits على auth/search/uploads/checkout، وتنقيح الهاتف والكود والتوكن من logs.
- قائمة DTOs الحالية لا تتضمن batch expiry tracking أو delivery أو online payments؛ إضافتها لاحقًا بإصدارات متوافقة.
- polling صفحة الطلب كل 15 ثانية وهي ظاهرة مع backoff وتوقف عند الحالة النهائية أو إخفاء الصفحة.
- توثيق OpenAPI واختبارات contract سيُنشآن أثناء التنفيذ ويشملان جميع schemas/errors/security المحددة هنا.

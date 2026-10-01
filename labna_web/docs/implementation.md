# المرحلة الأولى — التشغيل وحدود التنفيذ

## واجهات الإدارة متاحة كـ API

لا توجد لوحة React بعد. استخدم Postman أو curl لتجربة CRUD. افتراضيًا الخدمة على `http://localhost:3001`.

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

إنشاء المنتج ينشئ inventory row بصفر؛ لذلك سيكون غير متوفر إلى حين تنفيذ إدارة المخزون وإدخال جرد فعلي. لا توجد أداة HTTP مكشوفة لزيادة المخزون دون سجل في هذه المرحلة.

### 4. التعديل والأرشفة

```text
PATCH /api/v1/admin/products/milk-full
{ "version": 0, "isFeatured": false }

DELETE /api/v1/admin/products/milk-full
{ "version": 1 }
```

version قديم =>409. الحذف أرشفة، ولا يمكن إعادة استخدام ID مؤرشف. variants لها IDs ثابتة؛ لتعطيل أحدها أرسل variants كاملة مع isActive=false، لا تحذف العنصر. القسم الذي لديه منتجات لا يُؤرشف، وفرع الاستلام الافتراضي يحتاج بديلًا أولًا.

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

## الحدود والاختيارات المرحلية

- الخدمة تعمل كعملية واحدة؛ rate limits داخل الذاكرة. التوسع لعدة replicas يحتاج limiter مشترك وضبط proxy موثوق قبل النشر خلف load balancer.
- cursor موقّع مرتبط بالفلاتر وlimit، ويستخدم offset حتى 10,000. الفرز يحسم التعادل بـid؛ التعديلات أثناء التنقل قد تحرك الصفحات، ولا توجد snapshot guarantee.
- إدارة الكتالوج تستخدم قفل revision داخل معاملات MongoDB لتسلسل التعديلات المرتبطة. هذا مناسب للمتجر الحالي، وليس تصميمًا لأعداد ضخمة من الكتابات.
- payload الكتالوج داخل حقل `data` في MongoDB، مع strict Zod validation عند كل كتابة API. الـAPI يعرض DTO مسطحًا. لا تُكتب payloads مباشرة من خارج services.
- إدارة settings الحالية تعدل الفرع الافتراضي فقط. بيانات contact/policies تبقى فارغة إلى حين مرحلة إدارة إعدادات المتجر.
- حماية أرشفة الفرع تفحص المخزون المحجوز الآن؛ عند تنفيذ الطلبات يجب إضافة فحص الطلبات المفتوحة داخل المعاملة نفسها.
- فرع acceptsOrders=false يرجع خيارات غير متاحة؛ إغلاق ساعات العمل وحده لا يوقف التوفر، بما يتوافق مع قبول الطلبات للمعالجة التالية.
- iOS لم يُربط بهذه الخدمة بعد؛ استجابات envelope وpagination تحتاج adapter. الملفات المحلية القديمة ما زالت تعمل.
- وثائق `backend-design.md` و`api-v1.md` تمثل الخطة الكاملة. المصدر الدقيق للمسارات الحالية هو `/api/v1/openapi.json`.

# Labna Web

مرحلة المشروع الحالية: **Full-stack e-commerce demo**: Backend + Admin Dashboard + Customer Storefront مبنية على Node.js/Express/MongoDB وReact.

## المنفّذ الآن

- Express 5 + TypeScript + Mongoose، مع health endpoints وإيقاف منظم للسيرفر.
- استيراد كتالوج تطبيق iOS (`Labna/Labna/Resources/Data`) عبر أمر `npm run seed`، بنفس قواعد الكتابة المستخدمة في لوحة الإدارة.
- Storefront React على `5175`: Home, Catalog, Product details, Cart, Checkout, Order tracking, Login/Register, Account, Addresses, My Orders, Reorder.
- Admin React على `5174`: Catalog, Inventory, Orders lifecycle, Dashboard analytics, Settings.
- Customer auth وStaff auth منفصلان: Argon2، JWT access tokens، refresh cookies دوارة، logout.
- Cart validation وcheckout يعيدان قراءة المنتجات والأسعار والمخزون من MongoDB؛ لا يثق الخادم بسعر الواجهة.
- Orders بحالات كاملة، status history، mock payments، وربط اختياري بـcustomerId.
- Inventory لكل variant/branch: onHand/reserved/available، low/out-of-stock، adjustments، movements، reserve/cancel/complete integration.
- Dashboard حقيقي من MongoDB aggregation: revenue, orders, AOV, status breakdown, top products, sales by day/week, low stock.
- حساب مواعيد الفروع والاستثناءات اليومية بتوقيت الفرع.
- Zod validation، أخطاء موحدة، CORS، rate limiting، وسجل تدقيق للتعديلات.
- OpenAPI 3.1 حي على `/api/v1/openapi.json` مشتق جزئيًا من schemas المستخدمة فعليًا.
- اختبارات تكامل باستخدام MongoDB replica set مؤقت حقيقي، وليس mock لقاعدة البيانات.
- مخططات Zod مشتركة بين اللوحة والخادم في `packages/contracts`، مع تحقق على الطرفين.
- اختبارات للـ API واللوحة تغطي catalog, auth, cart, orders, inventory, dashboard, forms.

ما ليس production حقيقيًا: الدفع وOTP والإشعارات ورفع الصور مزيفة/غير منفذة عمدًا؛ الهدف Demo قوي للـ CV وليس متجرًا ماليًا حقيقيًا.

## Architecture

```text
Browser
  ├─ Admin Dashboard :5174 ─┐
  └─ Storefront      :5175 ─┤ Vite proxy /api
                            ↓
Express API :3001
  ├─ shared Zod contracts
  ├─ Staff auth / Customer auth
  ├─ Catalog / Cart / Orders / Inventory / Dashboard
  ↓
MongoDB replica set
```

## التشغيل المحلي

نفّذ الأوامر التالية من مجلد `labna_web`:

```bash
nvm install
nvm use
npm ci
docker compose up -d --wait
cp apps/api/.env.example apps/api/.env
```

يتطلب المشروع Node.js 22.12+ من سلسلة 22 LTS أو 24+. تم الاختبار على Node.js 22.23.3. ملف Docker للتطوير المحلي فقط، وقاعدة البيانات مقيدة بمنفذ localhost. يمكن استخدام MongoDB Atlas بدل Docker؛ حدّث `MONGODB_URI`.

عدّل `apps/api/.env`:
- ولّد `JWT_SECRET` و`CURSOR_SECRET` بشكل مستقل ومخالف لكل منهما باستخدام `openssl rand -hex 32` (64 حرفًا لكل مفتاح). قيمة فارغة أو قصيرة تُرفض برسالة توضح المطلوب.
- حدّد `SEED_ADMIN_EMAIL` و`SEED_ADMIN_PASSWORD` (12 حرفًا على الأقل).
- اختياريًا حدّد `SEED_CUSTOMER_EMAIL` و`SEED_CUSTOMER_PASSWORD` لإنشاء حساب عميل demo.
- اضبط `MEDIA_ORIGINS` على مضيف صورك. الكتالوج المستورد من iOS يستخدم `https://images.unsplash.com`، لذا أضف هذا المضيف أو غيّر مصدر الصور.
- اضبط `WEB_ORIGINS` على أصول واجهاتك؛ التطوير يحتاج `http://localhost:5174,http://localhost:5175`.
- `SEED_STOCK_ON_HAND` اختياري (الافتراضي صفر). القيمة الموجبة تضبط مخزونًا تجريبيًا عبر تعديلات مسجلة.
- لا ترفع `.env` إلى Git؛ هو مستثنى بالفعل.

```bash
npm run seed
npm run dev:api
```

`npm run seed` ينشئ المدير والعميل التجريبي، ثم يستورد الكتالوج من `seed/ios-catalog/` وينشئ مخزونًا وطلبات demo بحالات مختلفة. الأمر آمن لإعادة التشغيل: يحدّث سجلات الكتالوج الموجودة ولا يكرر طلبات demo الثابتة.

بيانات demo المقترحة محليًا:

```text
Manager:  admin@example.com / password@12345
Customer: customer@example.com / password123
```

لا تستخدم هذه القيم في بيئة عامة.

الاستيراد يطبع ملاحظات تشرح القرارات، أهمها:

- **`isAvailable` في iOS تصبح `isActive` في الـ API.** الخيار غير المتوفر في iOS يُستورد معطّلًا ويُذكر في الملاحظات.
- **`sku` غير موجود في iOS**، فيُشتق من معرّف الخيار بحروف كبيرة (`milk-full-500` تصبح `MILK-FULL-500`).
- المنتجات تُستورد منشورة، والفروع تظهر للعملاء وتقبل الطلبات.
- **المخزون الافتراضي صفر.** عند تفعيل `SEED_STOCK_ON_HAND` تكون الأرقام تجريبية وتُسجل لها حركات؛ استبدلها بالجرد الفعلي قبل أي استخدام حقيقي.
- فرع الاستلام الافتراضي يُضبط على أول فرع متاح إن لم يكن محددًا.

لتحديث نسخة الكتالوج بعد تعديل ملفات JSON في تطبيق iOS:

```bash
cp ../Labna/Labna/Resources/Data/{categories,products,banners,branches}.json seed/ios-catalog/
```

لا يغيّر `npm run seed` كلمة مرور حساب مدير أو عميل موجود. المنفذ الافتراضي `3001`.

افتح Terminal ثانيًا من `labna_web` وشغّل لوحة الإدارة:

```bash
npm run dev:admin
```

افتح `http://localhost:5174` وسجّل ببيانات المدير من `.env`. يجب أن يكون المنفذ 5174 متاحًا؛ يتوقف Vite برسالة واضحة إذا كان مشغولًا حتى لا يختلف أصل المتصفح عن `WEB_ORIGINS`. لوحة الإدارة تمرر `/api` إلى API المحلي عبر Vite proxy، ولذلك لا تحتاج `VITE_API_BASE_URL` في التطوير. يمكن تغيير وجهة الـ proxy بواسطة `LABNA_API_URL` إذا كان الخادم على مضيف/منفذ آخر. في النشر، قدّم الواجهة والـ API تحت نفس الأصل عبر reverse proxy يمرر `/api` إلى الخادم مع HTTPS، وسجّل هذا الأصل ضمن `WEB_ORIGINS`؛ مجلد `dist` وحده لا يوفر proxy.

وشغّل متجر العملاء:

```bash
npm run dev:storefront
```

افتح `http://localhost:5175` وجرب: product → cart → checkout → confirmation → admin orders → status change → storefront refresh.

```bash
curl http://localhost:3001/health/ready
curl http://localhost:3001/api/v1/store
curl http://localhost:3001/api/v1/openapi.json
```

بعد الدخول ستجد كتالوجًا وطلبات demo جاهزة. خطوات API المكافئة موضحة في [دليل التشغيل](docs/implementation.md).

## التحقق والبناء

```bash
npm run typecheck
npm test
npm run build
npm audit
npm run start -w @labna/api
```

الاختبارات تستخدم قاعدة معزولة مؤقتة ولا تتصل بـ`.env`. أول تشغيل قد يحتاج تنزيل MongoDB binary. `npm run openapi --silent` يطبع وثيقة OpenAPI إلى stdout.

ملف `package-lock.json` مثبت في المشروع. استخدم `npm ci` للتثبيت المتكرر؛ إذا واجه npm 10 خطأ `edgesOut` عند ترقية dependencies فاستخدم npm 11 مع Node LTS.

## Deployment Notes

- Backend: شغّل `npm run build -w @labna/api` ثم `npm run start -w @labna/api` خلف HTTPS reverse proxy.
- MongoDB: استخدم replica set؛ محليًا `docker compose up -d --wait`، وعلى السحابة MongoDB Atlas مناسب.
- Admin/Storefront: شغّل `npm run build -w @labna/admin` و`npm run build -w @labna/storefront` وقدّم `dist` لكل تطبيق.
- Proxy: مرر `/api` إلى backend، أو اضبط `LABNA_API_URL` أثناء التطوير فقط. في production أضف أصول HTTPS إلى `WEB_ORIGINS`.
- Secrets: ولّد `JWT_SECRET` و`CURSOR_SECRET` مستقلين. لا تنشر `.env`.
- Images: أضف مضيف الصور إلى `MEDIA_ORIGINS`، أو استخدم تكامل Cloudinary/S3 لاحقًا.

## Portfolio Checklist

- اعرض screenshots للصفحات: storefront home/catalog/product/cart/checkout/tracking، admin dashboard/orders/inventory.
- اشرح في الـ CV: server-side price validation، inventory reservation، order lifecycle، MongoDB aggregation dashboard، shared Zod contracts.
- OpenAPI: `npm run openapi --silent` أو `/api/v1/openapi.json`.
- Demo script: سجل كعميل، أنشئ order، افتح admin وغيّر الحالة، ارجع للـ storefront واضغط refresh.

## النطاق المعتمد

- متجر ويب بتخطيط مكتبي متجاوب، وهوية لبنة، ووظائف متوافقة مع تطبيق iOS.
- الاستلام من الفرع فقط، والدفع عند الاستلام، دون توصيل أو حجز موعد.
- فرع استلام واحد مبدئيًا؛ إدارة عدة فروع وتفعيل الاستلام منها لاحقًا.
- مخزون لكل خيار منتج ولكل فرع، وأسعار وكتالوج موحدان.
- حسابات عملاء بالبريد وكلمة المرور للـ demo؛ لا يوجد OTP حقيقي.
- السلة محلية، ثم checkout يربط الطلب بالحساب إن كان العميل مسجل الدخول.
- المفضلة والمشاهدات غير منفذة.
- إلغاء العميل الذاتي غير منفذ؛ الإلغاء من لوحة الإدارة.
- قبول الطلبات خارج مواعيد العمل مع إعلام العميل بأنها تُعالج عند الفتح التالي.

## الوثائق

1. [تصميم الباك إند والبيانات](docs/backend-design.md)
2. [عقد API v1](docs/api-v1.md)

## الهيكل الحالي والخطة

```text
labna_web/
  apps/
    api/          # Node.js, Express, TypeScript, Mongoose
    storefront/   # React / Vite: متجر العملاء
    admin/        # React / Vite: لوحة الإدارة العربية
  packages/
    contracts/    # مخططات Zod وأنواع TypeScript المشتركة
  docs/
```

MongoDB replica set مطلوب للمعاملات، حتى في بيئة التطوير. السيرفر يتحقق من هذا الشرط عند بدء التشغيل. schemas الحالية في `packages/contracts/src/index.ts`، وتوثيق OpenAPI في `apps/api/src/openapi.ts`.

## مراحل لاحقة اختيارية

1. رفع صور حقيقي Cloudinary/S3 بدل روابط فقط.
2. OTP/SMS وإشعارات بريدية.
3. Payment gateway حقيقي.
4. E2E tests بـ Playwright وسيناريو screenshots تلقائي.

OpenAPI الحي يصف المسارات المنفّذة فقط. التفاصيل والحدود موثقة في `docs/implementation.md`.

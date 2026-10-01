# تصميم الباك إند — v1

## 1. المعمارية

Modular monolith باستخدام Express وTypeScript. الوحدات: auth، catalog، branches، inventory، orders، customer-sync، media، staff، settings، notifications.

كل وحدة تفصل routes/validation عن services وقواعد العمل وrepositories. تطبيق iOS والمتجر ولوحة التحكم يستخدمون API واحدًا. الأسعار والصلاحيات والمخزون تُحسم على السيرفر.

بوابة الوقت والرسائل والتخزين قابلة للاستبدال للاختبار. الأحداث التي تتطلب إشعارًا تُسجل في outbox ضمن معاملة تغيير الطلب، ثم يعالجها worker مع retry ومنع التكرار. فشل الإشعار لا يرجع حالة الطلب.

## 2. قواعد البيانات العامة

- `_id` داخلي من MongoDB، و`id` نصي عام ثابت وفريد. الحفاظ على IDs الحالية مثل `milk-full` أثناء استيراد الكتالوج كي تبقى الروابط والمفضلة صالحة.
- التواريخ UTC بصيغة ISO 8601 في API؛ مواعيد الفروع بتوقيت IANA المحلي.
- النصوص المحلية `{ ar, en }`. الأموال أعداد صحيحة بوحدات العملة الصغرى، دون floating point.
- `createdAt`, `updatedAt` لكل سجل، و`version` للسجلات القابلة للتعديل المتزامن.
- أرشفة الكتالوج والفروع المرتبطة بالطلبات بدل حذف السجل التاريخي.
- العقود لا تكشف `_id` أو password hashes أو معلومات جلسات داخلية.

## 3. المجموعات والفهارس

| Collection | الحقول الأساسية | الفهارس المهمة |
|---|---|---|
| customers | id, phoneE164, name, status(active/blocked), sessionVersion | phoneE164 unique; id unique |
| staffUsers | id, emailNormalized, passwordHash, role(manager/orderOperator), status, sessionVersion | emailNormalized unique |
| authChallenges | id, phoneE164, codeHash, expiresAt, attempts, consumedAt | id unique; TTL expiresAt |
| sessions | id, subjectType, subjectID, refreshHash, expiresAt, revokedAt, familyID | refreshHash unique; TTL expiresAt |
| categories | id, name, imageURL, sortOrder, archivedAt | id unique; sortOrder,id |
| products | id, categoryID, name, description, ingredients, storageInstructions, imageURLs, isFeatured, publicationStatus, variants[] | id unique; categoryID,publicationStatus; variants.id unique across products |
| branches | id, name, address, coordinate, phoneNumber, timeZoneIdentifier, openingHours[], dateOverrides[], isVisible, pickupEnabled, acceptsOrders | id unique |
| banners | id, title, subtitle, imageURL, destination{kind,id}, sortOrder, isActive | id unique; sortOrder,id |
| inventory | id, branchID, variantID, onHand, reserved, lowStockThreshold, version | branchID+variantID unique |
| inventoryMovements | id, inventoryID, orderID?, onHandDelta, reservedDelta, reason, actorID, commandID, createdAt | inventoryID,createdAt; commandID+inventoryID unique |
| orders | id, number, customerID, branchID, snapshots, lines[], totals, status, paymentStatus, history[], version, readyAt?, collectedAt? | number unique; customerID,createdAt,id; branchID,status,createdAt |
| favorites | customerID, productID, active, revision | customerID+productID unique |
| recentlyViewed | customerID, productID, lastViewedAt, revision | customerID+productID unique; customerID,lastViewedAt |
| customerSyncState | customerID, revision, historyGeneration | customerID unique |
| idempotencyRecords | subjectID, route, key, requestHash, responseStatus, responseBody, expiresAt | subjectID+route+key unique; TTL expiresAt |
| deviceTokens | customerID, installationID, token, platform, environment | installationID unique |
| outbox | eventID, type, payload, state, attempts, nextAttemptAt | eventID unique; state,nextAttemptAt |
| auditLogs | actorID, action, resourceID, changes, requestID, createdAt | resourceID,createdAt |
| settings | id=store, currencyCode, defaultPickupBranchID, contact, policies, acceptOutsideHours | id unique |

### خيارات المنتج

تُضمّن الخيارات في المنتج لأن عددها محدود. كل خيار يحتوي:
`id, sku, label{ar,en}, quantity, unit(ml/g), priceMinor, currencyCode, isActive`.

`quantity` هنا حجم العبوة وليس المخزون. عدد العبوات يوجد في inventory. التحقق يرفض تكرار variant IDs داخل المستند نفسه، إضافة إلى الفهرس الذي يمنع تكرارها عبر المنتجات. SKU فريد عند تخصيصه.

لا تخزن `isAvailable` كحقيقة مستقلة: تُشتق من نشر المنتج وتفعيل الخيار ووجود كمية متاحة في الفرع المختار. لا يؤدي مخزون فرع آخر إلى إتاحة المنتج في فرع الاستلام المحدد.

### الطلب

يحفظ snapshots للاسم والهاتف وبيانات الفرع وعناوين المنتجات وخياراتها وأسعارها والعملة. `lines` تحتوي productID, variantID, quantity, unitPriceMinor, lineTotalMinor. لا تتغير الطلبات السابقة عند تعديل المنتج.

v1: subtotalMinor = totalMinor، لا رسوم توصيل ولا خصومات أو حساب ضرائب إضافية في checkout. سياسة الضرائب المحلية تحتاج اعتمادًا قبل التشغيل التجاري؛ لا نفترض تلقائيًا أن الضريبة صفر. العملة موحدة في إعدادات المتجر، وEGP مثال متوافق مع بيانات التطبيق الحالية وليست تأكيدًا لبلد التشغيل.

## 4. المخزون والمعاملات

الثوابت: `onHand >= reserved >= 0`، و`available = onHand - reserved`.

### إنشاء الطلب

داخل transaction واحدة:
1. حجز idempotency key والتحقق من تطابق الطلب عند التكرار.
2. قراءة العميل والفرع والمنتجات والأسعار، ورفض العناصر غير النشطة أو اختلاف quote.
3. تجميع الأسطر المتكررة لكل variant والتحقق من حدود الكميات.
4. زيادة reserved لكل خيار بشرط ذري `onHand - reserved >= requested`.
5. إنشاء الطلب وسجل الحركات والحالات وoutbox وحفظ نتيجة idempotency.

أي فشل يرجع العملية كلها. أسعار quote تُقارن داخل المعاملة؛ تعديلات الكتالوج تستخدم version guards/كتابة مشروطة على سجلات التسعير المشاركة لضمان عدم اعتماد سعر قديم عند تزامن تغيير السعر وإنشاء الطلب. تنفيذ هذا الجزء يحتاج اختبار تزامن صريح.

### انتقال الحالات

| من | إلى | من ينفذ | أثر المخزون |
|---|---|---|---|
| pendingConfirmation | confirmed | manager/orderOperator | لا تغيير |
| confirmed | preparing | manager/orderOperator | لا تغيير |
| preparing | readyForPickup | manager/orderOperator | لا تغيير، إنشاء حدث إشعار |
| readyForPickup | collected | manager/orderOperator | إنقاص onHand وreserved، وتسجيل paid |
| pendingConfirmation | cancelled | صاحب الطلب أو الموظف | تحرير reserved |
| confirmed/preparing/readyForPickup | cancelled | الموظف مع سبب وتسوية الكمية | تحرير reserved وتسجيل التالف إن وجد |

لا إلغاء أو تعديل مخزون لطلب collected/cancelled. لا توجد قفزات أو رجوع حالات في v1. كل انتقال مشروط بـversion والحالة الحالية وداخل معاملة، كي لا يُحرّر الحجز أو يسجل الدفع مرتين.

إلغاء طلب مُجهز لا يعيد كل الكمية للبيع تلقائيًا: يحدد الموظف `discardQuantity` لكل سطر (بين صفر والكمية المطلوبة). يتم إنقاص onHand بالتالف وتحرير الحجز كاملًا في المعاملة نفسها.

عدم حضور العميل يعالج يدويًا؛ لا مؤقت يعيد طعامًا مجهزًا إلى المخزون. تصحيح الجرد الذي يجعل onHand أقل من reserved يُرفض بـ409.

## 5. الفروع والوقت

حاليًا defaultPickupBranchID واحد. عرض فرع لا يعني أنه pickupEnabled. تفعيل فرع ثانٍ يستلزم مخزونه، ويختار العميل الفرع قبل عرض توفر نهائي أو مراجعة الطلب.

openingHours تستخدم ISO weekdays 1–7 وفترات محلية؛ يمكن عدة فترات/يوم. dateOverrides تتجاوز الجدول للعطلات. v1 يمنع فترات تعبر منتصف الليل ويقسمها إلى يومين. الخادم يحسب isOpen وnextOpensAt مع timezone وDST.

فرع خارج مواعيد العمل يقبل الطلب إذا acceptsOrders=true وفق القرار المعتمد، ويعيد تنبيهًا وprocessingStartsAt دون وعد بموعد جاهزية. acceptsOrders=false يوقف الطلبات حتى لو كان الفرع مفتوحًا.

## 6. الدخول والصلاحيات

OTP ثابت فقط مع OTP_MODE=fixed في development/test؛ السيرفر يرفض بدء production بهذا الوضع. لا يرجع الكود في استجابة عامة ولا يُسجل في logs. صلاحية challenge خمس دقائق، خمس محاولات، وحدود إرسال حسب الهاتف وIP. TTL للتنظيف فقط؛ التحقق من expiresAt في منطق التطبيق إلزامي.

جلسات قصيرة: access token لمدة 15 دقيقة، refresh دوّار لمدة 30 يومًا مع إبطال العائلة عند اكتشاف إعادة استخدام. المتصفح يستخدم refresh cookie من نوع HttpOnly/Secure/SameSite مع فحص Origin وحماية CSRF لمسارات cookie. iOS يخزن refresh في Keychain. قناة العميل تحدد شكل نقل refresh، لا تمنح صلاحيات إضافية.

حسابات الإدارة منفصلة، كلمة مرور hashed باستخدام Argon2id، ولا تستخدم كود العملاء. كل طلب خاص يتحقق من subjectType وحالة الحساب وملكية المورد. orderOperator لا يدير الكتالوج أو الموظفين أو تعديلات الجرد العامة. سجلات العملاء والطلبات ليست متاحة لمجرد معرفة ID.

## 7. المزامنة

المفضلة والمشاهدات تُخزن محليًا للزائر. الدمج المحلي يحدث مرة عند تسجيل الدخول؛ بعد ذلك العميل يرسل عمليات لا نسخًا قديمة كاملة.

- عمليات favorites تحمل operationID وbaseRevision، تُطبق بترتيب وصول السيرفر. تعارض revision يعيد 409 مع أحدث state ولا يعيد العميل إضافة محذوفة تلقائيًا.
- الحذف يبقي tombstone لمنع إحياء عنصر من جهاز قديم. full snapshot هو مصدر الحقيقة.
- viewed events تقبل viewedAt UTC ضمن آخر 30 يومًا وغير مستقبلية بأكثر من خمس دقائق، وتُقيد بالوقت الحالي؛ تُحفظ أحدث مشاهدة لكل منتج، ثم آخر 50 منتجًا فقط.
- مسح history يزيد historyGeneration. عمليات جهاز قديم بجيل سابق تُرفض حتى يجلب الحالة الجديدة؛ لا تعيد السجلات المحذوفة.
- كل دفعة sync ذريّة، بحد 100 عملية، ومفتاح idempotency. عند logout تُعزل بيانات الحساب وpending operations ولا تُنقل لحساب آخر.
- المنتج المؤرشف يختفي من قوائم العرض، ويبقى الأمر واضحًا عبر قائمة unavailableProductIDs في استجابة المزامنة.

## 8. التوافق مع iOS واختبارات القبول

نحافظ على `categoryID`, `imageURLs`, النصوص الثنائية، `priceMinor`, `currencyCode` و`variants` و`isDemo=false`. Product.quantity تعني حجم العبوة كما في التطبيق. Banner.destination تبقى product/category. Branch يحتفظ بـcoordinate وtimeZoneIdentifier وopeningHours.

يلزم adapter في RemoteCatalogDataSource لفك envelope وpagination، وربط auth والطلبات الحقيقية بدل demo checkout. لا نغير صيغة الملفات المضمنة دون migration. الكاش للتصفح فقط؛ checkout يتطلب شبكة.

اختبارات إلزامية قبل التشغيل:
- طلبان على آخر عبوة: واحد فقط ينجح؛ طلب متعدد الأسطر يفشل دون حجز جزئي.
- retry لنفس الطلب يعيد نفس order؛ نفس المفتاح وbody مختلف =>409.
- تزامن تأكيد الموظف مع إلغاء العميل لا يطبق الحالتين.
- collected مكرر لا يخصم مرتين؛ إلغاء جاهز يسجل التالف بطريقة صحيحة.
- التحقق من ملكية كل order ومن صلاحيات الموظف.
- OTP منتهي/مكرر/تجاوز المحاولات، refresh reuse، وتعطيل حساب.
- دمج مفضلة وحذفها من جهازين، ومسح history مع جهاز offline.
- الفرع مغلق، عطلة، وطلب بعد منتصف الليل في timezone الفرع.
- توافق DTOs مع decoding الحقيقي في iOS، وليس TypeScript فقط.

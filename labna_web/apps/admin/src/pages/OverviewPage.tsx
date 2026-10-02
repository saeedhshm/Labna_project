import { Link } from 'react-router-dom';
import { useResourceList } from '../api/queries';
import { Panel, Spinner, Notice } from '../components/Primitives';

type CountDTO = { id: string; isVisible?: boolean; pickupEnabled?: boolean; publicationStatus?: string };

/**
 * Summarizes the loaded catalog pages so a manager can spot an empty store quickly.
 * Order metrics are not shown because those APIs are not built yet;
 * showing zeroes for revenue would be misleading.
 */
export function OverviewPage() {
  const products = useResourceList<CountDTO>('products');
  const categories = useResourceList<CountDTO>('categories');
  const banners = useResourceList<CountDTO>('banners');
  const branches = useResourceList<CountDTO>('branches');

  const count = (query: { data?: { pages: { items: unknown[] }[] } }) => query.data?.pages.reduce((sum, page) => sum + page.items.length, 0);
  const productItems = products.data?.pages.flatMap(page => page.items) ?? [];
  const published = productItems.filter(item => item.publicationStatus === 'published').length;
  const branchItems = branches.data?.pages.flatMap(page => page.items) ?? [];
  const pickup = branchItems.filter(item => item.isVisible && item.pickupEnabled);

  if (products.isPending || categories.isPending || banners.isPending || branches.isPending) {
    return <Spinner label="جارٍ تحميل النظرة العامة…" />;
  }
  if (products.isError || categories.isError || banners.isError || branches.isError) {
    return <Notice tone="error">تعذر تحميل بيانات المتجر.</Notice>;
  }

  return (
    <div className="stack">
      <Panel title="نظرة عامة">
        <div className="tiles">
          <article>
            <span>المنتجات المعروضة</span>
            <strong>{count(products) ?? 0}</strong>
            <small>{published} منشورة {products.hasNextPage ? '· يوجد المزيد' : ''}</small>
          </article>
          <article>
            <span>الأقسام المعروضة</span>
            <strong>{count(categories) ?? 0}</strong>
            {categories.hasNextPage ? <small>يوجد المزيد</small> : null}
          </article>
          <article>
            <span>البنرات المعروضة</span>
            <strong>{count(banners) ?? 0}</strong>
            {banners.hasNextPage ? <small>يوجد المزيد</small> : null}
          </article>
          <article>
            <span>الفروع المعروضة</span>
            <strong>{branchItems.length}</strong>
            <small>{pickup.length} يدعم الاستلام {branches.hasNextPage ? '· يوجد المزيد' : ''}</small>
          </article>
        </div>
      </Panel>
      <Panel title="خطوات الإعداد">
        <ol className="steps">
          <li>
            أنشئ <Link to="/branches">فرعًا</Link> واحدًا على الأقل، وأدخل عنوانه ومواعيده.
          </li>
          <li>
            حدّد <Link to="/settings">فرع الاستلام الافتراضي</Link>، وإلا لن تظهر المنتجات للعملاء.
          </li>
          <li>
            أضف <Link to="/categories">قسمًا</Link> واحدًا على الأقل.
          </li>
          <li>
            أضف <Link to="/products">منتجًا</Link> بخيارات العبوة والأسعار.
          </li>
          <li>
            أضف <Link to="/banners">بنرًا</Link> يشير إلى قسم أو منتج منشور.
          </li>
        </ol>
        <Notice tone="info">المخزون يبدأ بصفر. افتح <Link to="/inventory">إدارة المخزون</Link> لإدخال كميات الجرد وحدود التنبيه.</Notice>
      </Panel>
      <Panel title="المراحل القادمة">
        <ul className="plain-list">
          <li>الطلبات وتغيير الحالات والتحصيل عند الاستلام.</li>
          <li>حسابات العملاء بكود التحقق والمفضلة المتزامنة.</li>
          <li>رفع الصور ومتجر العملاء على الويب.</li>
        </ul>
      </Panel>
    </div>
  );
}

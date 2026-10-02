import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { LoadingGrid, ProductCard, StateCard } from '../components';
import { useLanguage } from '../i18n';
import { text } from '../types';

export function HomePage() {
  const { locale, t } = useLanguage();
  const banners = useQuery({ queryKey: ['banners'], queryFn: ({ signal }) => api.banners(signal) });
  const categories = useQuery({ queryKey: ['categories'], queryFn: ({ signal }) => api.categories(signal) });
  const featured = useQuery({ queryKey: ['products', 'featured', locale], queryFn: ({ signal }) => api.products({ featured: true, limit: 8, locale }, signal) });
  const mainBanner = banners.data?.data[0];

  return (
    <>
      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow">{t('طازج من لبنة', 'Fresh from Labna')}</p>
          <h1>{mainBanner ? text(mainBanner.title, locale) : t('منتجات ألبان طازجة تصل إلى بابك', 'Fresh dairy products delivered to your door')}</h1>
          <p>{mainBanner ? text(mainBanner.subtitle, locale) : t('تصفح الحليب والزبادي والجبن والزبدة من كتالوج لبنة.', 'Browse milk, yogurt, cheese and butter from Labna catalog.')}</p>
          <div className="hero__actions">
            <Link className="button" to="/catalog">{t('تصفح المنتجات', 'Shop products')}</Link>
            <Link className="button button--ghost" to="/catalog?available=true">{t('المتاح الآن', 'Available now')}</Link>
          </div>
        </div>
        <div className="hero__media">
          {mainBanner ? <img src={mainBanner.imageURL} alt="" /> : <div className="hero__placeholder" />}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <div>
            <p className="eyebrow">{t('الأقسام', 'Categories')}</p>
            <h2>{t('اختر حسب احتياجك', 'Shop by need')}</h2>
          </div>
          <Link to="/catalog">{t('كل المنتجات', 'All products')}</Link>
        </div>
        {categories.isPending ? <div className="category-strip is-loading" /> : null}
        {categories.isError ? <StateCard title={t('تعذر تحميل الأقسام.', 'Could not load categories.')} /> : null}
        <div className="category-strip">
          {categories.data?.data.map(category => (
            <Link className="category-chip" key={category.id} to={`/categories/${category.id}`}>
              <img src={category.imageURL} alt="" loading="lazy" />
              <span>{text(category.name, locale)}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <div>
            <p className="eyebrow">{t('اختيارات مميزة', 'Featured picks')}</p>
            <h2>{t('منتجات يطلبها العملاء كثيرًا', 'Customer favorites')}</h2>
          </div>
          <Link to="/catalog?sort=featured">{t('مشاهدة المزيد', 'View more')}</Link>
        </div>
        {featured.isPending ? <LoadingGrid label={t('جار تحميل المنتجات المميزة', 'Loading featured products')} /> : null}
        {featured.isError ? <StateCard title={t('تعذر تحميل المنتجات.', 'Could not load products.')} /> : null}
        {featured.data?.data.length === 0 ? <StateCard title={t('لا توجد منتجات مميزة الآن.', 'No featured products yet.')} /> : null}
        <div className="grid products-grid">
          {featured.data?.data.map(product => (
            <ProductCard key={product.id} product={product} category={categories.data?.data.find(category => category.id === product.categoryID)} />
          ))}
        </div>
      </section>
    </>
  );
}

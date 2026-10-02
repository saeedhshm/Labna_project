import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { BannerCarousel, LoadingGrid, ProductCard, StateCard } from '../components';
import { useLanguage } from '../i18n';
import { text } from '../types';

export function HomePage() {
  const { locale, t } = useLanguage();
  const banners = useQuery({ queryKey: ['banners'], queryFn: ({ signal }) => api.banners(signal) });
  const categories = useQuery({ queryKey: ['categories'], queryFn: ({ signal }) => api.categories(signal) });
  const featured = useQuery({
    queryKey: ['products', 'featured', locale],
    queryFn: ({ signal }) => api.products({ featured: true, limit: 8, locale }, signal),
  });
  const branches = useQuery({ queryKey: ['branches'], queryFn: ({ signal }) => api.branches(signal) });

  return (
    <>
      {banners.isPending ? (
        <div className="banner-carousel banner-carousel--loading" role="status" aria-label={t('جار تحميل البنرات…', 'Loading banners…')}>
          <div className="banner-carousel__track">
            <div className="banner-carousel__slide">
              <div className="banner-carousel__placeholder" />
            </div>
          </div>
        </div>
      ) : banners.isError ? (
        <StateCard title={t('تعذر تحميل البنرات.', 'Could not load banners.')} />
      ) : banners.data?.data.length ? (
        <BannerCarousel banners={banners.data.data} />
      ) : null}

      <section className="section">
        <div className="section__head">
          <div>
            <p className="eyebrow">{t('الأقسام', 'Categories')}</p>
            <h2>{t('اختر حسب احتياجك', 'Shop by need')}</h2>
          </div>
          <Link to="/products">{t('كل المنتجات', 'All products')}</Link>
        </div>
        {categories.isPending ? <div className="category-strip is-loading" /> : null}
        {categories.isError ? <StateCard title={t('تعذر تحميل الأقسام.', 'Could not load categories.')} /> : null}
        {categories.data?.data.length === 0 && categories.isSuccess ? <StateCard title={t('لا توجد أقسام بعد.', 'No categories yet.')} /> : null}
        <div className="category-strip">
          {categories.data?.data.map((category) => (
            <Link className="category-chip" key={category.id} to={`/products?category=${category.id}`}>
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
          <Link to="/products?sort=featured">{t('مشاهدة المزيد', 'View more')}</Link>
        </div>
        {featured.isPending ? <LoadingGrid label={t('جار تحميل المنتجات المميزة', 'Loading featured products')} /> : null}
        {featured.isError ? <StateCard title={t('تعذر تحميل المنتجات.', 'Could not load products.')} /> : null}
        {featured.data?.data.length === 0 && featured.isSuccess ? <StateCard title={t('لا توجد منتجات مميزة الآن.', 'No featured products yet.')} /> : null}
        <div className="grid products-grid">
          {featured.data?.data.map((product) => (
            <ProductCard key={product.id} product={product} category={categories.data?.data.find((category) => category.id === product.categoryID)} />
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <div>
            <p className="eyebrow">{t('الفروع', 'Branches')}</p>
            <h2>{t('أقرب فرع لك', 'Find a branch near you')}</h2>
          </div>
          <Link to="/branches">{t('كل الفروع', 'View all branches')}</Link>
        </div>
        {branches.isPending ? <div className="skeleton-lines" /> : null}
        {branches.isError ? <StateCard title={t('تعذر تحميل الفروع.', 'Could not load branches.')} /> : null}
        {branches.data?.data.length === 0 && branches.isSuccess ? <StateCard title={t('لا توجد فروع متاحة حاليًا.', 'No branches available yet.')} /> : null}
        <div className="grid branches-grid">
          {branches.data?.data.slice(0, 3).map((branch) => (
            <article className="branch-card" key={branch.id}>
              <h2>{text(branch.name, locale)}</h2>
              <p>{text(branch.address, locale)}</p>
              <div className="branch-card__meta">
                <span className={`tag ${branch.isOpen ? 'tag--ok' : 'tag--muted'}`}>{branch.isOpen ? t('مفتوح', 'Open') : t('مغلق', 'Closed')}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

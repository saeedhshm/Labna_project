import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { BannerCarousel, BranchPreviewCard, LoadingGrid, ProductCard, StateCard } from '../components';
import { useLanguage } from '../i18n';
import { usePageMeta } from '../meta';
import { useRecentlyViewed } from '../recently-viewed';
import { text } from '../types';
import type { PublicCategory } from '../types';

export function HomePage() {
  const { locale, t } = useLanguage();
  usePageMeta(t('منتجات ألبان طازجة', 'Fresh dairy products'));
  const navigate = useNavigate();
  const recentlyViewed = useRecentlyViewed();
  const [searchInput, setSearchInput] = useState('');

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    // Hand the query to the catalog, which owns filtering and pagination.
    navigate(searchInput.trim() ? `/products?q=${encodeURIComponent(searchInput.trim())}` : '/products');
  };
  const banners = useQuery({ queryKey: ['banners'], queryFn: ({ signal }) => api.banners(signal) });
  const categories = useQuery({ queryKey: ['categories'], queryFn: ({ signal }) => api.categories(signal) });
  const featured = useQuery({
    queryKey: ['products', 'featured', locale],
    queryFn: ({ signal }) => api.products({ featured: true, limit: 8, locale }, signal),
  });
  const branches = useQuery({ queryKey: ['branches'], queryFn: ({ signal }) => api.branches(signal) });

  return (
    <>
      <h1 className="sr-only">{t('لبنة — منتجات ألبان طازجة', 'Labna — fresh dairy products')}</h1>
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
        <form className="quick-search" role="search" onSubmit={submitSearch}>
          <label className="visually-hidden" htmlFor="home-search">
            {t('ابحث عن منتج', 'Search products')}
          </label>
          <input
            id="home-search"
            name="q"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t('ابحث عن لبن، زبادي…', 'Search for milk, yogurt…')}
          />
          <button className="button" type="submit">
            {t('بحث', 'Search')}
          </button>
        </form>
      </section>

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

      {recentlyViewed.productIDs.length > 0 ? (
        <section className="section" aria-labelledby="recently-viewed-heading">
          <div className="section__head">
            <div>
              <p className="eyebrow">{t('شوهد مؤخرًا', 'Recently viewed')}</p>
              <h2 id="recently-viewed-heading">{t('ارجع لما شفته', 'Pick up where you left off')}</h2>
            </div>
            <button type="button" className="link-button" onClick={recentlyViewed.clear}>
              {t('مسح السجل', 'Clear history')}
            </button>
          </div>
          <RecentlyViewedGrid productIDs={recentlyViewed.productIDs} categories={categories.data?.data} />
        </section>
      ) : null}

      <section className="section">
        <div className="section__head">
          <div>
            <p className="eyebrow">{t('الفروع', 'Branches')}</p>
            <h2>{t('أقرب فرع لك', 'Find a branch near you')}</h2>
          </div>
          <Link to="/branches">{t('كل الفروع', 'View all branches')}</Link>
        </div>
        {branches.isPending ? (
          <div className="grid branches-grid" role="status" aria-label={t('جار تحميل الفروع…', 'Loading branches…')}>
            {Array.from({ length: 3 }, (_, index) => (
              <div className="skeleton-card" key={index} />
            ))}
          </div>
        ) : null}
        {branches.isError ? <StateCard title={t('تعذر تحميل الفروع.', 'Could not load branches.')} /> : null}
        {branches.data?.data.length === 0 && branches.isSuccess ? <StateCard title={t('لا توجد فروع متاحة حاليًا.', 'No branches available yet.')} /> : null}
        <div className="grid branches-grid branches-grid--preview">
          {branches.data?.data.slice(0, 3).map((branch) => (
            <BranchPreviewCard key={branch.id} branch={branch} />
          ))}
        </div>
      </section>
    </>
  );
}

/** Resolves stored ids against the live catalog so a price or availability
 * change is reflected immediately, and drops ids the catalog no longer serves. */
function RecentlyViewedGrid({ productIDs, categories }: { productIDs: string[]; categories?: PublicCategory[] }) {
  const { locale, t } = useLanguage();
  const recent = useQuery({
    queryKey: ['recently-viewed', 'products', locale, productIDs],
    queryFn: async ({ signal }) => {
      const resolved = await Promise.all(
        productIDs.map(async (id) => {
          try {
            return (await api.product(id, locale, signal)).data;
          } catch {
            return null;
          }
        }),
      );
      return resolved.filter((item) => item !== null);
    },
    staleTime: 60_000,
  });

  if (recent.isError) return <StateCard title={t('تعذر تحميل المنتجات الأخيرة.', 'Could not load recently viewed products.')} />;
  if (!recent.data?.length) return null;

  return (
    <div className="grid products-grid">
      {recent.data.map((product) => (
        <ProductCard key={product.id} product={product} category={categories?.find((category) => category.id === product.categoryID)} />
      ))}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { LoadingGrid, ProductCard, StateCard } from '../components';
import { useLanguage } from '../i18n';
import { usePageMeta } from '../meta';
import { text } from '../types';

const sortOptions = ['featured', 'name', 'priceAsc', 'priceDesc'] as const;
type SortOption = (typeof sortOptions)[number];
const sortLabels: Record<SortOption, { ar: string; en: string }> = {
  featured: { ar: 'المميز أولًا', en: 'Featured first' },
  name: { ar: 'الاسم', en: 'Name' },
  priceAsc: { ar: 'السعر من الأقل', en: 'Price low to high' },
  priceDesc: { ar: 'السعر من الأعلى', en: 'Price high to low' },
};

export function CatalogPage() {
  const { categoryId } = useParams();
  const [params, setParams] = useSearchParams();
  const { locale, t } = useLanguage();

  const [searchInput, setSearchInput] = useState(params.get('q') ?? '');

  const search = params.get('q') ?? '';
  usePageMeta(search ? t(`نتائج البحث عن ${search}`, `Search results for ${search}`) : t('المنتجات', 'Products'));
  const sortParam = params.get('sort');
  const sort: SortOption = (sortOptions as readonly string[]).includes(sortParam ?? '') ? (sortParam as SortOption) : 'featured';
  const available = params.get('available') === 'true' ? true : undefined;
  const featured = params.get('featured') === 'true' ? true : undefined;
  const cursor = params.get('cursor') ?? undefined;
  const categoryParam = params.get('category');
  const categoryID = categoryId ?? (categoryParam || undefined);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (searchInput.trim()) next.set('q', searchInput.trim());
          else next.delete('q');
          next.delete('cursor');
          return next;
        },
        { replace: true },
      );
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchInput, setParams]);

  const categories = useQuery({ queryKey: ['categories'], queryFn: ({ signal }) => api.categories(signal) });
  const products = useQuery({
    queryKey: ['products', 'catalog', locale, categoryID, search, sort, available, featured, cursor],
    queryFn: ({ signal }) => api.products({ locale, categoryID, q: search || undefined, sort, available, featured, cursor, limit: 12 }, signal),
  });

  const selected = categories.data?.data.find((category) => category.id === categoryID);

  function updateParam(key: string, value: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        next.delete('cursor');
        return next;
      },
      { replace: true },
    );
  }

  function goToCursor(nextCursor: string | null) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (nextCursor) next.set('cursor', nextCursor);
        else next.delete('cursor');
        return next;
      },
      { replace: true },
    );
  }

  return (
    <section className="section catalog-page">
      <div className="section__head catalog-title">
        <div>
          <p className="eyebrow">{t('الكتالوج', 'Catalog')}</p>
          <h1>{selected ? text(selected.name, locale) : t('كل منتجات لبنة', 'All Labna products')}</h1>
        </div>
        {categoryID ? (
          <button className="ghost" type="button" onClick={() => updateParam('category', '')}>
            {t('إزالة القسم', 'Clear category')}
          </button>
        ) : null}
      </div>

      <div className="catalog-layout">
        <aside className="catalog-filters">
          <div className="filters">
            <label>
              <span>{t('بحث', 'Search')}</span>
              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={t('ابحث عن حليب أو جبن...', 'Search milk, cheese...')}
                aria-label={t('بحث في المنتجات', 'Search products')}
              />
            </label>
            <label>
              <span>{t('ترتيب', 'Sort')}</span>
              <select value={sort} onChange={(event) => updateParam('sort', event.target.value)} aria-label={t('ترتيب المنتجات', 'Sort products')}>
                {sortOptions.map((option) => (
                  <option key={option} value={option}>
                    {sortLabels[option][locale]}
                  </option>
                ))}
              </select>
            </label>
            <label className="check-filter">
              <input type="checkbox" checked={available === true} onChange={(event) => updateParam('available', event.target.checked ? 'true' : '')} />
              {t('المتاح فقط', 'Available only')}
            </label>
            <label className="check-filter">
              <input type="checkbox" checked={featured === true} onChange={(event) => updateParam('featured', event.target.checked ? 'true' : '')} />
              {t('المميز فقط', 'Featured only')}
            </label>
          </div>
          {categories.data?.data.length ? (
            <nav className="category-nav" aria-label={t('الأقسام', 'Categories')}>
              <button type="button" className={`category-nav__item${!categoryID ? ' is-active' : ''}`} onClick={() => updateParam('category', '')}>
                {t('كل الأقسام', 'All categories')}
              </button>
              {categories.data.data.map((category) => (
                <button key={category.id} type="button" className={`category-nav__item${category.id === (categoryID ?? '') ? ' is-active' : ''}`} onClick={() => updateParam('category', category.id)}>
                  {text(category.name, locale)}
                </button>
              ))}
            </nav>
          ) : null}
        </aside>

        <div className="catalog-results">
          {products.isPending ? <LoadingGrid label={t('جار تحميل المنتجات', 'Loading products')} /> : null}
          {products.isError ? (
            <StateCard
              title={t('تعذر تحميل المنتجات.', 'Could not load products.')}
              action={
                <button className="button" type="button" onClick={() => products.refetch()}>
                  {t('إعادة المحاولة', 'Retry')}
                </button>
              }
            />
          ) : null}
          {products.data?.data.length === 0 && products.isSuccess ? (
            <StateCard
              title={t('لا توجد منتجات مطابقة.', 'No matching products.')}
              action={
                <button
                  className="button"
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    setParams({}, { replace: true });
                  }}
                >
                  {t('مسح الفلاتر', 'Clear filters')}
                </button>
              }
            />
          ) : null}
          <div className="grid products-grid">
            {products.data?.data.map((product) => (
              <ProductCard key={product.id} product={product} category={categories.data?.data.find((category) => category.id === product.categoryID)} />
            ))}
          </div>
          {products.data?.meta.nextCursor || params.get('cursor') ? (
            <div className="pagination">
              <button className="button button--ghost" type="button" disabled={!params.get('cursor')} onClick={() => goToCursor(null)}>
                {t('السابق', 'Previous')}
              </button>
              <button className="button" type="button" disabled={!products.data?.meta.nextCursor} onClick={() => goToCursor(products.data?.meta.nextCursor ?? null)}>
                {t('التالي', 'Next')}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

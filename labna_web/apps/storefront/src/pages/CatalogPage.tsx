import { useDeferredValue, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { LoadingGrid, ProductCard, StateCard } from '../components';
import { useLanguage } from '../i18n';
import { text, type ProductFilters } from '../types';

const sortOptions: ProductFilters['sort'][] = ['featured', 'name', 'priceAsc', 'priceDesc'];

export function CatalogPage() {
  const { categoryID } = useParams();
  const [params, setParams] = useSearchParams();
  const { locale, t } = useLanguage();
  const [cursor, setCursor] = useState<string | undefined>();
  const search = params.get('q') ?? '';
  const deferredSearch = useDeferredValue(search);
  const sort = sortOptions.includes(params.get('sort') as ProductFilters['sort']) ? params.get('sort') as ProductFilters['sort'] : 'featured';
  const available = params.get('available') === 'true' ? true : undefined;
  const categories = useQuery({ queryKey: ['categories'], queryFn: ({ signal }) => api.categories(signal) });
  const products = useQuery({
    queryKey: ['products', 'catalog', locale, categoryID, deferredSearch, sort, available, cursor],
    queryFn: ({ signal }) => api.products({ locale, categoryID, q: deferredSearch || undefined, sort, available, cursor, limit: 12 }, signal),
  });
  const selected = categories.data?.data.find(category => category.id === categoryID);

  function updateParam(key: string, value: string) {
    setCursor(undefined);
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  return (
    <section className="section catalog-page">
      <div className="section__head catalog-title">
        <div>
          <p className="eyebrow">{t('الكتالوج', 'Catalog')}</p>
          <h1>{selected ? text(selected.name, locale) : t('كل منتجات لبنة', 'All Labna products')}</h1>
        </div>
        {categoryID ? <Link to="/catalog">{t('إزالة القسم', 'Clear category')}</Link> : null}
      </div>

      <form className="filters" role="search" onSubmit={event => event.preventDefault()}>
        <label>
          <span>{t('بحث', 'Search')}</span>
          <input value={search} onChange={event => updateParam('q', event.target.value)} placeholder={t('ابحث عن حليب أو جبن...', 'Search milk, cheese...')} />
        </label>
        <label>
          <span>{t('ترتيب', 'Sort')}</span>
          <select value={sort} onChange={event => updateParam('sort', event.target.value)}>
            <option value="featured">{t('المميز أولًا', 'Featured first')}</option>
            <option value="name">{t('الاسم', 'Name')}</option>
            <option value="priceAsc">{t('السعر من الأقل', 'Price low to high')}</option>
            <option value="priceDesc">{t('السعر من الأعلى', 'Price high to low')}</option>
          </select>
        </label>
        <label className="check-filter">
          <input type="checkbox" checked={available === true} onChange={event => updateParam('available', event.target.checked ? 'true' : '')} />
          {t('المتاح فقط', 'Available only')}
        </label>
      </form>

      <div className="category-strip category-strip--compact">
        {categories.data?.data.map(category => (
          <Link className={`category-chip${category.id === categoryID ? ' is-active' : ''}`} key={category.id} to={`/categories/${category.id}${params.toString() ? `?${params}` : ''}`} onClick={() => setCursor(undefined)}>
            <span>{text(category.name, locale)}</span>
          </Link>
        ))}
      </div>

      {products.isPending ? <LoadingGrid label={t('جار تحميل المنتجات', 'Loading products')} /> : null}
      {products.isError ? <StateCard title={t('تعذر تحميل المنتجات.', 'Could not load products.')} /> : null}
      {products.data?.data.length === 0 ? <StateCard title={t('لا توجد منتجات مطابقة.', 'No matching products.')} /> : null}
      <div className="grid products-grid">
        {products.data?.data.map(product => (
          <ProductCard key={product.id} product={product} category={categories.data?.data.find(category => category.id === product.categoryID)} />
        ))}
      </div>
      {products.data?.meta.nextCursor ? (
        <button className="button button--wide" type="button" onClick={() => setCursor(products.data.meta.nextCursor ?? undefined)}>
          {t('عرض المزيد', 'Load more')}
        </button>
      ) : products.isSuccess ? <p className="hint centered">{t('تم عرض كل النتائج.', 'All results are visible.')}</p> : null}
    </section>
  );
}

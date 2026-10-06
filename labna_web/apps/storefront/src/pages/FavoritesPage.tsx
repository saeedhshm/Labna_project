import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { useFavorites } from '../favorites';
import { useLanguage } from '../i18n';
import { usePageMeta } from '../meta';
import { ProductCard } from '../components';

/**
 * Saved products for a signed-in customer. The list holds only product ids, so
 * each card is resolved from the live catalog and a product that disappeared
 * simply stops appearing.
 */
export function FavoritesPage() {
  const { t } = useLanguage();
  usePageMeta(t('المفضلة', 'Favorites'));
  const { accessToken } = useAuth();
  const { productIDs } = useFavorites();

  const products = useQuery({
    queryKey: ['favorites', 'products', productIDs],
    queryFn: async ({ signal }) => {
      const results = await Promise.all(
        productIDs.map(async (id) => {
          try {
            return (await api.product(id, 'ar', signal)).data;
          } catch {
            return null;
          }
        }),
      );
      return results.filter((product) => product !== null);
    },
    enabled: Boolean(accessToken) && productIDs.length > 0,
    staleTime: 60_000,
  });

  if (productIDs.length === 0) {
    return (
      <section className="page">
        <h1>{t('المفضلة', 'Favorites')}</h1>
        <p className="muted">{t('لم تضف أي منتج إلى المفضلة بعد.', 'You have not saved any products yet.')}</p>
        <Link className="button" to="/products">
          {t('تصفح المنتجات', 'Browse products')}
        </Link>
      </section>
    );
  }

  return (
    <section className="page">
      <h1>{t('المفضلة', 'Favorites')}</h1>
      <p className="muted">
        {productIDs.length} {t('منتج محفوظ', productIDs.length === 1 ? 'saved product' : 'saved products')}
      </p>
      {products.isError ? <p role="alert">{t('تعذر تحميل المفضلة. حاول مرة أخرى.', 'Could not load favorites. Try again.')}</p> : null}
      <div className="product-grid">
        {products.data?.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}

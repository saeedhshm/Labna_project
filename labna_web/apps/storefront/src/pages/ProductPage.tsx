import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useCart } from '../cart';
import { StateCard, VariantOption } from '../components';
import { money } from '../format';
import { useLanguage } from '../i18n';
import { text } from '../types';

export function ProductPage() {
  const { productID = '' } = useParams();
  const navigate = useNavigate();
  const cart = useCart();
  const { locale, t } = useLanguage();
  const [selectedVariantID, setSelectedVariantID] = useState<string>();
  const [quantity, setQuantity] = useState(1);
  const product = useQuery({ queryKey: ['product', productID], queryFn: ({ signal }) => api.product(productID, signal), enabled: Boolean(productID) });
  const data = product.data?.data;
  const selected = data?.variants.find(variant => variant.id === selectedVariantID) ?? data?.variants.find(variant => variant.isAvailable) ?? data?.variants[0];
  const maxQuantity = Math.max(1, selected?.availableQuantity ?? 1);

  if (product.isPending) return <section className="product-detail product-detail--loading"><div className="skeleton-card" /><div className="skeleton-lines" /></section>;
  if (product.isError || !data) return <StateCard title={t('تعذر تحميل المنتج.', 'Could not load product.')} action={<Link className="button" to="/catalog">{t('العودة للمنتجات', 'Back to catalog')}</Link>} />;

  return (
    <section className="product-detail">
      <div className="gallery">
        <img className="gallery__main" src={data.imageURLs[0]} alt={text(data.name, locale)} />
        <div className="gallery__thumbs">
          {data.imageURLs.map(url => <img key={url} src={url} alt="" loading="lazy" />)}
        </div>
      </div>

      <div className="product-info">
        <Link className="back-link" to={`/categories/${data.categoryID}`}>{t('العودة للقسم', 'Back to category')}</Link>
        <p className="eyebrow">{data.isFeatured ? t('منتج مميز', 'Featured product') : t('منتج لبنة', 'Labna product')}</p>
        <h1>{text(data.name, locale)}</h1>
        <p className="lead">{text(data.description, locale)}</p>
        <div className="price-panel">
          <span>{t('السعر', 'Price')}</span>
          <strong>{selected ? money(selected.priceMinor, selected.currencyCode, locale) : t('غير متوفر', 'Unavailable')}</strong>
        </div>

        <div className="product-section">
          <h2>{t('اختر الحجم', 'Choose a size')}</h2>
          <div className="variant-list">
            {data.variants.map(variant => (
              <VariantOption key={variant.id} variant={variant} selected={variant.id === selected?.id} onSelect={() => { setSelectedVariantID(variant.id); setQuantity(1); }} />
            ))}
          </div>
        </div>

        <div className="quantity-row">
          <label htmlFor="quantity">{t('الكمية', 'Quantity')}</label>
          <div className="quantity-control">
            <button type="button" onClick={() => setQuantity(value => Math.max(1, value - 1))}>-</button>
            <input id="quantity" type="number" min="1" max={maxQuantity} value={quantity} onChange={event => setQuantity(Math.min(maxQuantity, Math.max(1, Number(event.target.value) || 1)))} />
            <button type="button" onClick={() => setQuantity(value => Math.min(maxQuantity, value + 1))}>+</button>
          </div>
        </div>

        <div className="product-section facts">
          <div>
            <span>{t('المكونات', 'Ingredients')}</span>
            <p>{text(data.ingredients, locale)}</p>
          </div>
          <div>
            <span>{t('الحفظ', 'Storage')}</span>
            <p>{text(data.storageInstructions, locale)}</p>
          </div>
        </div>

        <button
          className="button button--wide"
          type="button"
          disabled={!selected?.isAvailable}
          onClick={() => {
            if (!selected) return;
            cart.add(data, selected, quantity);
            navigate('/cart');
          }}
        >
          {selected?.isAvailable ? t('إضافة إلى السلة', 'Add to cart') : t('غير متوفر حاليًا', 'Currently unavailable')}
        </button>
      </div>
    </section>
  );
}

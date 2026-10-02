import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useCart } from '../cart';
import { AddToCartPanel, ProductGallery, QuantityStepper, StateCard, VariantPicker } from '../components';
import { money } from '../format';
import { useLanguage } from '../i18n';
import { clampQuantity, isAvailabilityError, isMissingProduct, isPurchasable, quantityBounds, resolveVariant } from '../product-detail';
import { text } from '../types';
import type { PublicVariant } from '../types';

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function ProductPage() {
  const { productId = '' } = useParams();
  const { locale, t } = useLanguage();
  const cart = useCart();
  const [selectedVariantID, setSelectedVariantID] = useState<string>();
  const [quantity, setQuantity] = useState(1);

  const product = useQuery({
    queryKey: ['product', productId, locale],
    queryFn: ({ signal }) => api.product(productId, locale, signal),
    enabled: Boolean(productId),
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: ({ signal }) => api.categories(signal),
    enabled: product.isSuccess,
  });

  const data = product.data?.data;
  const selected = data ? resolveVariant(data.variants, selectedVariantID) : undefined;
  const bounds = quantityBounds(selected);
  const category = categories.data?.data.find((item) => item.id === data?.categoryID);
  const anyAvailable = data ? isPurchasable(data.variants) : false;

  // Switching variant can change the ceiling, so the quantity is re-clamped
  // whenever the selected variant changes rather than keeping a stale value.
  useEffect(() => {
    setQuantity((current) => clampQuantity(current, bounds));
  }, [bounds.max, bounds.min]);

  if (product.isPending) {
    return (
      <section className="product-detail product-detail--loading" aria-busy="true">
        <div className="skeleton-card" />
        <div className="skeleton-lines" />
      </section>
    );
  }

  if (isMissingProduct(product.error)) {
    return (
      <StateCard
        title={t('هذا المنتج غير متاح.', 'This product is not available.')}
        action={
          <Link className="button" to="/products">
            {t('تصفح المنتجات', 'Browse products')}
          </Link>
        }
      />
    );
  }

  if (isAvailabilityError(product.error)) {
    return (
      <StateCard
        title={t('المتجر غير جاهز لعرض المنتجات الآن.', 'The store cannot show products right now.')}
        action={
          <button className="button" type="button" onClick={() => void product.refetch()}>
            {t('إعادة المحاولة', 'Retry')}
          </button>
        }
      />
    );
  }

  if (product.isError || !data) {
    return (
      <StateCard
        title={t('تعذر تحميل المنتج.', 'Could not load product.')}
        action={
          <button className="button" type="button" onClick={() => void product.refetch()}>
            {t('إعادة المحاولة', 'Retry')}
          </button>
        }
      />
    );
  }

  const description = optional(text(data.description, locale));
  const ingredients = optional(text(data.ingredients, locale));
  const storage = optional(text(data.storageInstructions, locale));
  const name = text(data.name, locale);

  function chooseVariant(variant: PublicVariant) {
    setSelectedVariantID(variant.id);
    setQuantity((current) => clampQuantity(current, quantityBounds(variant)));
  }

  return (
    <article className="product-detail">
      <ProductGallery images={data.imageURLs} alt={name} />

      <div className="product-info">
        <nav className="breadcrumbs" aria-label={t('مسار التنقل', 'Breadcrumb')}>
          <Link to="/products">{t('المنتجات', 'Products')}</Link>
          {category ? (
            <>
              <span aria-hidden="true">/</span>
              <Link to={`/products?category=${data.categoryID}`}>{text(category.name, locale)}</Link>
            </>
          ) : null}
        </nav>

        {data.isFeatured ? <p className="eyebrow">{t('منتج مميز', 'Featured product')}</p> : null}
        <h1>{name}</h1>
        {description ? <p className="lead">{description}</p> : null}

        <p className={`availability${anyAvailable ? '' : ' is-out'}`}>
          {anyAvailable ? t('متوفر حاليًا', 'In stock') : t('غير متوفر حاليًا', 'Out of stock')}
        </p>

        <div className="price-panel">
          <span>{t('السعر', 'Price')}</span>
          <strong>{selected ? money(selected.priceMinor, selected.currencyCode, locale) : t('غير متوفر', 'Unavailable')}</strong>
        </div>

        <VariantPicker
          name="variant"
          legend={data.variants.length > 1 ? t('اختر الحجم', 'Choose a size') : t('الحجم', 'Size')}
          variants={data.variants}
          selected={selected}
          onSelect={chooseVariant}
        />

        <QuantityStepper
          value={quantity}
          bounds={bounds}
          onChange={setQuantity}
          label={t('الكمية', 'Quantity')}
          decrementLabel={t('إنقاص الكمية', 'Decrease quantity')}
          incrementLabel={t('زيادة الكمية', 'Increase quantity')}
          hint={
            selected?.isAvailable
              ? `${t('الحد الأقصى', 'Maximum')} ${bounds.max}`
              : t('غير متاح', 'Not available')
          }
        />

        <AddToCartPanel
          productId={data.id}
          variant={selected}
          quantity={quantity}
          bounds={bounds}
          onAdd={({ variantID }) => {
            const variant = data.variants.find((item) => item.id === variantID);
            if (!variant) return;
            cart.add(data, variant, quantity);
          }}
        />

        {ingredients || storage ? (
          <div className="product-section facts">
            {ingredients ? (
              <div>
                <span>{t('المكونات', 'Ingredients')}</span>
                <p>{ingredients}</p>
              </div>
            ) : null}
            {storage ? (
              <div>
                <span>{t('الحفظ', 'Storage')}</span>
                <p>{storage}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

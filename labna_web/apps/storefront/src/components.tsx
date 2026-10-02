import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { money, unit } from './format';
import { useLanguage } from './i18n';
import type { PublicCategory, PublicProduct, PublicVariant } from './types';
import { text } from './types';

export function LoadingGrid({ label }: { label: string }) {
  return (
    <div aria-label={label} className="grid products-grid">
      {Array.from({ length: 6 }, (_, index) => <div className="skeleton-card" key={index} />)}
    </div>
  );
}

export function StateCard({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <section className="state-card">
      <p>{title}</p>
      {action}
    </section>
  );
}

export function ProductCard({ product, category }: { product: PublicProduct; category?: PublicCategory }) {
  const { locale, t } = useLanguage();
  const available = product.variants.filter(variant => variant.isAvailable);
  const starting = [...available].sort((a, b) => a.priceMinor - b.priceMinor)[0];
  return (
    <article className="product-card">
      <Link to={`/products/${product.id}`} className="product-card__image" aria-label={text(product.name, locale)}>
        <img src={product.imageURLs[0]} alt="" loading="lazy" />
        {product.isFeatured ? <span className="pill">{t('مميز', 'Featured')}</span> : null}
      </Link>
      <div className="product-card__body">
        <p className="eyebrow">{category ? text(category.name, locale) : product.categoryID}</p>
        <h3><Link to={`/products/${product.id}`}>{text(product.name, locale)}</Link></h3>
        <p>{text(product.description, locale)}</p>
        <div className="product-card__meta">
          <strong>{starting ? t('يبدأ من ', 'From ') + money(starting.priceMinor, starting.currencyCode, locale) : t('غير متوفر', 'Unavailable')}</strong>
          <span>{available.length} {t('خيارات', 'options')}</span>
        </div>
      </div>
    </article>
  );
}

export function VariantOption({ variant, selected, onSelect }: { variant: PublicVariant; selected: boolean; onSelect: () => void }) {
  const { locale, t } = useLanguage();
  return (
    <button type="button" className={`variant-option${selected ? ' is-selected' : ''}`} disabled={!variant.isAvailable} onClick={onSelect}>
      <span>{text(variant.label, locale)} · {unit(variant.quantity, variant.unit, locale)}</span>
      <strong>{money(variant.priceMinor, variant.currencyCode, locale)}</strong>
      <small>{variant.isAvailable ? `${variant.availableQuantity} ${t('متاح', 'available')}` : t('غير متوفر', 'Unavailable')}</small>
    </button>
  );
}

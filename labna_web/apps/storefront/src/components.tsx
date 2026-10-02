import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { money, unit } from './format';
import { useLanguage } from './i18n';
import type { PublicBanner, PublicCategory, PublicProduct, PublicVariant } from './types';
import { text } from './types';

export function LoadingGrid({ label }: { label: string }) {
  return (
    <div aria-label={label} className="grid products-grid" role="status">
      {Array.from({ length: 8 }, (_, index) => (
        <div className="skeleton-card" key={index} />
      ))}
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
  const available = product.variants.filter((variant) => variant.isAvailable);
  const starting = [...available].sort((a, b) => a.priceMinor - b.priceMinor)[0];

  return (
    <article className="product-card">
      <Link to={`/products/${product.id}`} className="product-card__image" aria-label={text(product.name, locale)}>
        <img src={product.imageURLs[0]} alt="" loading="lazy" />
        {product.isFeatured ? <span className="pill">{t('مميز', 'Featured')}</span> : null}
      </Link>
      <div className="product-card__body">
        <p className="eyebrow">{category ? text(category.name, locale) : product.categoryID}</p>
        <h3>
          <Link to={`/products/${product.id}`}>{text(product.name, locale)}</Link>
        </h3>
        <p>{text(product.description, locale)}</p>
        <div className="product-card__meta">
          <strong>
            {starting ? t('يبدأ من ', 'From ') + money(starting.priceMinor, starting.currencyCode, locale) : t('غير متوفر', 'Unavailable')}
          </strong>
          <span>
            {available.length} {t('خيارات', 'options')}
          </span>
        </div>
      </div>
    </article>
  );
}

export function VariantOption({ variant, selected, onSelect }: { variant: PublicVariant; selected: boolean; onSelect: () => void }) {
  const { locale, t } = useLanguage();
  return (
    <button type="button" className={`variant-option${selected ? ' is-selected' : ''}`} disabled={!variant.isAvailable} onClick={onSelect}>
      <span>
        {text(variant.label, locale)} · {unit(variant.quantity, variant.unit, locale)}
      </span>
      <strong>{money(variant.priceMinor, variant.currencyCode, locale)}</strong>
      <small>{variant.isAvailable ? `${variant.availableQuantity} ${t('متاح', 'available')}` : t('غير متوفر', 'Unavailable')}</small>
    </button>
  );
}

export function BannerCarousel({ banners }: { banners: PublicBanner[] }) {
  const { locale, t } = useLanguage();
  const [index, setIndex] = useState(0);
  const count = banners.length;

  useEffect(() => {
    if (count <= 1) return;
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, 5000);
    return () => clearInterval(timer);
  }, [count]);

  if (count === 0) return null;

  const goTo = (next: number) => {
    if (count <= 1) return;
    setIndex(((next % count) + count) % count);
  };

  const bannerHref = (banner: PublicBanner): string | null => {
    if (!banner.destination) return null;
    if (banner.destination.kind === 'product') return `/products/${banner.destination.id}`;
    if (banner.destination.kind === 'category') return `/categories/${banner.destination.id}`;
    return null;
  };

  return (
    <section className="banner-carousel" aria-roledescription="carousel" aria-label={t('البنرات الترويجية', 'Promotional banners')}>
      <div className="banner-carousel__track" style={{ transform: `translateX(${index * 100}%)` }}>
        {banners.map((banner, slideIndex) => {
          const href = bannerHref(banner);
          const content = (
            <>
              <img className="banner-carousel__image" src={banner.imageURL} alt="" loading={slideIndex === 0 ? 'eager' : 'lazy'} />
              <div className="banner-carousel__overlay">
                <p className="eyebrow">{t('طازج من لبنة', 'Fresh from Labna')}</p>
                <h1>{text(banner.title, locale)}</h1>
                <p>{text(banner.subtitle, locale)}</p>
                {href ? <span className="button">{t('اكتشف المزيد', 'Discover more')}</span> : null}
              </div>
            </>
          );
          return (
            <div className="banner-carousel__slide" key={banner.id} aria-hidden={slideIndex !== index} role="group" aria-roledescription="slide" aria-label={`${slideIndex + 1} of ${count}`}>
              {href ? <Link to={href} className="banner-carousel__link">{content}</Link> : <div className="banner-carousel__link">{content}</div>}
            </div>
          );
        })}
      </div>
      {count > 1 ? (
        <>
          <button className="banner-carousel__arrow banner-carousel__arrow--prev" type="button" aria-label={t('البنر السابق', 'Previous banner')} onClick={() => goTo(index - 1)}>
            ‹
          </button>
          <button className="banner-carousel__arrow banner-carousel__arrow--next" type="button" aria-label={t('البنر التالي', 'Next banner')} onClick={() => goTo(index + 1)}>
            ›
          </button>
          <div className="banner-carousel__dots" role="tablist" aria-label={t('اختيار البنر', 'Choose banner')}>
            {banners.map((banner, dotIndex) => (
              <button
                key={banner.id}
                type="button"
                role="tab"
                aria-selected={dotIndex === index}
                aria-label={`${t('بنر', 'Banner')} ${dotIndex + 1}`}
                className={`banner-carousel__dot${dotIndex === index ? ' is-active' : ''}`}
                onClick={() => goTo(dotIndex)}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

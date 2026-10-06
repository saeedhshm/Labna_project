import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { money, unit } from './format';
import { useLanguage } from './i18n';
import { useFavorites } from './favorites';
import type { PublicBanner, PublicBranch, PublicCategory, PublicProduct, PublicVariant } from './types';
import { text } from './types';
import { clampQuantity, galleryImages, startingPrice, type QuantityBounds } from './product-detail';
import { branchStatus, coordinatesLabel, directionsURL, formatIntervals, groupSchedule, hasSchedule, telHref, weekdayLabel } from './branch-hours';

export function BranchStatusBadge({ branch }: { branch: PublicBranch }) {
  const { locale } = useLanguage();
  const status = branchStatus(branch, locale);
  return (
    <span className={`branch-status branch-status--${status.tone}`}>
      <span className="branch-status__dot" aria-hidden="true" />
      {status.label}
      {status.detail ? <span className="branch-status__detail"> · {status.detail}</span> : null}
    </span>
  );
}

/** Compact card used on the Home page: enough to discover, not the full detail. */
export function BranchPreviewCard({ branch }: { branch: PublicBranch }) {
  const { locale, t } = useLanguage();
  return (
    <article className="branch-card branch-card--preview">
      <h3>{text(branch.name, locale)}</h3>
      <p>{text(branch.address, locale)}</p>
      <div className="branch-card__meta">
        <BranchStatusBadge branch={branch} />
        {telHref(branch.phoneNumber) ? (
          <a className="branch-card__call" href={telHref(branch.phoneNumber)!} dir="ltr" aria-label={t('اتصال بالفرع', 'Call this branch')}>
            {branch.phoneNumber}
          </a>
        ) : null}
      </div>
    </article>
  );
}

/** Full card on /branches: schedule, contact and directions. */
export function BranchCard({ branch }: { branch: PublicBranch }) {
  const { locale, t } = useLanguage();
  const rows = groupSchedule(branch.openingHours);
  const directions = directionsURL(branch);
  const coordinates = coordinatesLabel(branch, locale);
  const scheduled = hasSchedule(branch);

  return (
    <article className="branch-card">
      <header className="branch-card__head">
        <h2>{text(branch.name, locale)}</h2>
        <BranchStatusBadge branch={branch} />
      </header>

      <p className="branch-card__address">{text(branch.address, locale)}</p>

      <dl className="branch-card__facts">
        {telHref(branch.phoneNumber) ? (
          <div>
            <dt>{t('الهاتف', 'Phone')}</dt>
            <dd>
              <a href={telHref(branch.phoneNumber)!} dir="ltr" aria-label={`${t('اتصال بـ', 'Call')} ${text(branch.name, locale)}`}>
                {branch.phoneNumber}
              </a>
            </dd>
          </div>
        ) : null}
        {branch.pickupEnabled ? (
          <div>
            <dt>{t('الاستلام', 'Pickup')}</dt>
            <dd>{t('متاح', 'Available')}</dd>
          </div>
        ) : null}
        {coordinates ? (
          <div>
            <dt>{t('الموقع', 'Coordinates')}</dt>
            <dd dir="ltr">{coordinates}</dd>
          </div>
        ) : null}
        {branch.timeZoneIdentifier ? (
          <div>
            <dt>{t('التوقيت', 'Time zone')}</dt>
            <dd dir="ltr">{branch.timeZoneIdentifier}</dd>
          </div>
        ) : null}
      </dl>

      {scheduled ? (
        <section className="branch-card__hours">
          <h3>{t('مواعيد العمل الأسبوعية', 'Regular weekly hours')}</h3>
          <p className="branch-card__hours-note">{t('لا تشمل العطلات الرسمية', 'Public holidays are not included')}</p>
          <dl className="schedule">
            {rows.map((row) => (
              <div key={row.weekdays.join('-')}>
                <dt>{weekdayLabel(row.weekdays, locale)}</dt>
                <dd>{row.intervals.length ? formatIntervals(row.intervals, locale) : t('مغلق', 'Closed')}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : (
        <p className="branch-card__hours-none">{t('مواعيد العمل غير منشورة.', 'Opening hours are not published for this branch.')}</p>
      )}

      {directions ? (
        <a className="button button--wide branch-card__map" href={directions} target="_blank" rel="noreferrer noopener">
          {t('الاتجاهات على الخريطة', 'Get directions')}
        </a>
      ) : null}
    </article>
  );
}

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

/** Accessible favourite toggle. `aria-pressed` exposes saved state so the
 * control is understandable without relying on the icon alone. */
export function FavoriteButton({ productID, className }: { productID: string; className?: string }) {
  const { t } = useLanguage();
  const { isFavorite, toggle, pending } = useFavorites();
  const saved = isFavorite(productID);
  return (
    <button
      type="button"
      className={`${className ?? ''} favorite-button${saved ? ' is-saved' : ''}`.trim()}
      aria-pressed={saved}
      disabled={pending}
      onClick={(event) => {
        // The card itself is a link, so keep the tap on the button only.
        event.preventDefault();
        event.stopPropagation();
        void toggle(productID);
      }}
    >
      <span aria-hidden="true">{saved ? '♥' : '♡'}</span>
      <span className="visually-hidden">{saved ? t('إزالة من المفضلة', 'Remove from favorites') : t('إضافة إلى المفضلة', 'Add to favorites')}</span>
    </button>
  );
}

export function ProductCard({ product, category }: { product: PublicProduct; category?: PublicCategory }) {
  const { locale, t } = useLanguage();
  const available = product.variants.filter((variant) => variant.isAvailable);
  const startingVariant = [...available].sort((a, b) => a.priceMinor - b.priceMinor)[0];
  const starting = startingPrice(product.variants);

  return (
    <article className="product-card">
      <div className="product-card__media">
        <Link to={`/products/${product.id}`} className="product-card__image" aria-label={text(product.name, locale)}>
          <ProductImage src={product.imageURLs[0]} alt="" className="product-card__image-file" />
          {product.isFeatured ? <span className="pill">{t('مميز', 'Featured')}</span> : null}
        </Link>
        <FavoriteButton productID={product.id} className="product-card__favorite" />
      </div>
      <div className="product-card__body">
        <p className="eyebrow">{category ? text(category.name, locale) : product.categoryID}</p>
        <h3>
          <Link to={`/products/${product.id}`}>{text(product.name, locale)}</Link>
        </h3>
        <p>{text(product.description, locale)}</p>
        <div className="product-card__meta">
          <strong>{startingVariant && starting !== undefined ? t('يبدأ من ', 'From ') + money(starting, startingVariant.currencyCode, locale) : t('غير متوفر', 'Unavailable')}</strong>
          <span>
            {available.length} {t('خيارات', 'options')}
          </span>
        </div>
      </div>
    </article>
  );
}

/**
 * Renders one catalog image and falls back to a labelled placeholder when the
 * source is missing or the request fails, so a broken remote asset never leaves
 * a collapsed or collapsed-looking box behind.
 */
export function ProductImage({ src, alt, className, eager }: { src?: string; alt: string; className?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className={`${className ?? ''} image-fallback`.trim()} role="img" aria-label={alt}>
        <span aria-hidden="true">🥛</span>
      </div>
    );
  }
  return <img className={className} src={src} alt={alt} onError={() => setFailed(true)} loading={eager ? 'eager' : 'lazy'} decoding="async" />;
}

/** Main image plus keyboard-reachable thumbnails; the main frame reserves its aspect ratio. */
export function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const { t } = useLanguage();
  const [active, setActive] = useState(0);
  const sources = galleryImages(images);
  const current = sources[Math.min(active, Math.max(0, sources.length - 1))];

  return (
    <div className="gallery">
      <div className="gallery__frame">
        <ProductImage src={current} alt={alt} className="gallery__main" eager />
      </div>
      {sources.length > 1 ? (
        <div className="gallery__thumbs">
          {sources.map((url, index) => (
            <button
              key={url}
              type="button"
              className={`gallery__thumb${index === active ? ' is-active' : ''}`}
              aria-label={`${t('صورة', 'Image')} ${index + 1} / ${sources.length}`}
              aria-current={index === active}
              onClick={() => setActive(index)}
            >
              <ProductImage src={url} alt="" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Native radios give arrow-key navigation and correct disabled semantics, so an
 * unavailable variant can never be selected or announced as purchasable.
 */
export function VariantPicker({
  name,
  variants,
  selected,
  onSelect,
  legend,
}: {
  name: string;
  variants: PublicVariant[];
  selected: PublicVariant | undefined;
  onSelect: (variant: PublicVariant) => void;
  legend: string;
}) {
  const { locale, t } = useLanguage();
  return (
    <fieldset className="variant-picker">
      <legend>{legend}</legend>
      <div className="variant-list">
        {variants.map((variant) => {
          const isSelected = variant.id === selected?.id;
          const packSize = `${text(variant.label, locale)} · ${unit(variant.quantity, variant.unit, locale)}`;
          const availability = variant.isAvailable ? `${variant.availableQuantity} ${t('متاح', 'available')}` : t('غير متوفر', 'Out of stock');
          return (
            <label key={variant.id} className={`variant-option${isSelected ? ' is-selected' : ''}`} data-available={variant.isAvailable}>
              <input type="radio" name={name} value={variant.id} checked={isSelected} disabled={!variant.isAvailable} onChange={() => onSelect(variant)} />
              <span className="variant-option__pack">{packSize}</span>
              <strong className="variant-option__price">{money(variant.priceMinor, variant.currencyCode, locale)}</strong>
              <small className="variant-option__stock">{availability}</small>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function QuantityStepper({
  value,
  bounds,
  onChange,
  label,
  decrementLabel,
  incrementLabel,
  hint,
}: {
  value: number;
  bounds: QuantityBounds;
  onChange: (value: number) => void;
  label: string;
  decrementLabel: string;
  incrementLabel: string;
  hint: string;
}) {
  const labelId = useId();
  const hintId = useId();
  const disabled = bounds.max === 0;

  return (
    <div className="quantity-stepper">
      <span className="quantity-stepper__label" id={labelId}>
        {label}
      </span>
      <div className="quantity-stepper__controls">
        <button type="button" onClick={() => onChange(clampQuantity(value - 1, bounds))} disabled={disabled || value <= bounds.min} aria-label={decrementLabel}>
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={bounds.min}
          max={bounds.max}
          step={1}
          value={value}
          disabled={disabled}
          aria-labelledby={labelId}
          aria-describedby={hintId}
          onChange={(event) => onChange(clampQuantity(Number(event.target.value), bounds))}
        />
        <button type="button" onClick={() => onChange(clampQuantity(value + 1, bounds))} disabled={disabled || value >= bounds.max} aria-label={incrementLabel}>
          +
        </button>
      </div>
      <p className="quantity-stepper__hint" id={hintId} aria-live="polite">
        {hint}
      </p>
    </div>
  );
}

/** Reusable add-to-cart controls; sold-out products remain disabled. */
export function AddToCartPanel({
  productId,
  variant,
  quantity,
  bounds,
  onAdd,
  deferredMessage,
}: {
  productId: string;
  variant: PublicVariant | undefined;
  quantity: number;
  bounds: QuantityBounds;
  onAdd?: (input: { productID: string; variantID: string; quantity: number }) => void;
  deferredMessage?: string;
}) {
  const { locale, t } = useLanguage();
  const purchasable = Boolean(variant?.isAvailable) && bounds.max > 0;

  return (
    <div className="add-to-cart">
      <button
        type="button"
        className="button button--wide"
        disabled={!purchasable || !onAdd}
        onClick={() => {
          if (!purchasable || !variant || !onAdd) return;
          onAdd({ productID: productId, variantID: variant.id, quantity });
        }}
      >
        {purchasable ? t('إضافة إلى السلة', 'Add to cart') : t('غير متوفر حاليًا', 'Currently unavailable')}
      </button>
      {!onAdd && deferredMessage ? <p className="add-to-cart__note">{deferredMessage}</p> : null}
      {purchasable && variant ? (
        <p className="add-to-cart__total">
          {t('الإجمالي', 'Total')}
          <strong>{money(variant.priceMinor * quantity, variant.currencyCode, locale)}</strong>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Carousel track offset for a slide index. Flex lays the slides out
 * right-to-left under `dir="rtl"`, so advancing mirrors the offset; without this
 * the next slide is translated out of view instead of into it.
 */
export function bannerTrackOffset(index: number, dir: 'rtl' | 'ltr'): string {
  return `translateX(${(dir === 'rtl' ? index : -index) * 100}%)`;
}

export function BannerCarousel({ banners }: { banners: PublicBanner[] }) {
  const { dir, locale, t } = useLanguage();
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

  const bannerTarget = (banner: PublicBanner) => {
    const destination = banner.destination;
    if (destination?.kind === 'product') return { kind: 'route' as const, to: `/products/${destination.id}` };
    if (destination?.kind === 'category') return { kind: 'route' as const, to: `/categories/${destination.id}` };
    if (destination?.kind === 'external') return { kind: 'external' as const, href: destination.url };
    return { kind: 'none' as const };
  };

  return (
    <section className="banner-carousel" aria-roledescription="carousel" aria-label={t('البنرات الترويجية', 'Promotional banners')}>
      {/* Mirrored in RTL, see bannerTrackOffset. */}
      <div className="banner-carousel__track" style={{ transform: bannerTrackOffset(index, dir) }}>
        {banners.map((banner, slideIndex) => {
          const target = bannerTarget(banner);
          const cta = banner.cta ? text(banner.cta, locale) : t('اكتشف المزيد', 'Discover more');
          const content = (
            <>
              <img className="banner-carousel__image" src={banner.imageURL} alt="" loading={slideIndex === 0 ? 'eager' : 'lazy'} />
              <div className="banner-carousel__overlay">
                <p className="eyebrow">{t('طازج من لبنة', 'Fresh from Labna')}</p>
                <h2>{text(banner.title, locale)}</h2>
                <p>{text(banner.subtitle, locale)}</p>
                {target.kind === 'none' ? null : <span className="button">{cta}</span>}
              </div>
            </>
          );
          return (
            <div className="banner-carousel__slide" key={banner.id} aria-hidden={slideIndex !== index} role="group" aria-roledescription="slide" aria-label={`${slideIndex + 1} of ${count}`}>
              {target.kind === 'route' ? (
                <Link to={target.to} className="banner-carousel__link">
                  {content}
                </Link>
              ) : target.kind === 'external' ? (
                <a href={target.href} target="_blank" rel="noreferrer noopener" className="banner-carousel__link">
                  {content}
                </a>
              ) : (
                <div className="banner-carousel__link">{content}</div>
              )}
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

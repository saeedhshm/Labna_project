import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../src/i18n';
import { BannerCarousel, bannerTrackOffset } from '../src/components';
import type { PublicBanner } from '../src/types';

const image = 'https://images.unsplash.com/photo-1?w=800';

const banner = (overrides: Partial<PublicBanner> = {}): PublicBanner => ({
  id: 'b1',
  title: { ar: 'عنوان', en: 'Title' },
  subtitle: { ar: 'وصف', en: 'Subtitle' },
  imageURL: image,
  destination: { kind: 'category', id: 'milk' },
  sortOrder: 0,
  ...overrides,
});

beforeEach(() => {
  localStorage.setItem('labna.locale', 'en');
});

describe('BannerCarousel targets', () => {
  it('links a category banner to the catalog route', () => {
    render(
      <LanguageProvider>
        <MemoryRouter>
          <BannerCarousel banners={[banner()]} />
        </MemoryRouter>
      </LanguageProvider>,
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', '/categories/milk');
  });

  it('links a product banner to the product route', () => {
    render(
      <LanguageProvider>
        <MemoryRouter>
          <BannerCarousel banners={[banner({ destination: { kind: 'product', id: 'milk-full' } })]} />
        </MemoryRouter>
      </LanguageProvider>,
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', '/products/milk-full');
  });

  it('opens an external banner in a new tab with a safe rel', () => {
    render(
      <LanguageProvider>
        <MemoryRouter>
          <BannerCarousel banners={[banner({ destination: { kind: 'external', url: 'https://example.com/offers' } })]} />
        </MemoryRouter>
      </LanguageProvider>,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.com/offers');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('renders no link and no CTA for a banner without a destination', () => {
    render(
      <LanguageProvider>
        <MemoryRouter>
          <BannerCarousel banners={[banner({ destination: { kind: 'none' } })]} />
        </MemoryRouter>
      </LanguageProvider>,
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Discover more' })).not.toBeInTheDocument();
  });

  it('uses the manager supplied CTA label when present', () => {
    render(
      <LanguageProvider>
        <MemoryRouter>
          <BannerCarousel banners={[banner({ cta: { ar: 'اعرف المزيد', en: 'Learn more' } })]} />
        </MemoryRouter>
      </LanguageProvider>,
    );
    expect(screen.getByText('Learn more')).toBeInTheDocument();
  });

  it('moves between slides with the arrows', async () => {
    render(
      <LanguageProvider>
        <MemoryRouter>
          <BannerCarousel
            banners={[
              banner({ id: 'first', title: { ar: 'أ', en: 'First' } }),
              banner({ id: 'second', title: { ar: 'ب', en: 'Second' }, destination: { kind: 'none' } }),
            ]}
          />
        </MemoryRouter>
      </LanguageProvider>,
    );
    const slides = document.querySelectorAll('.banner-carousel__slide');
    expect(slides[0]).toHaveAttribute('aria-hidden', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Next banner' }));
    expect(document.querySelectorAll('.banner-carousel__slide')[1]).toHaveAttribute('aria-hidden', 'false');
  });

  it('mirrors the track offset in RTL so the active slide stays in view', () => {
    // RTL lays slides out right-to-left and advances with a positive offset;
    // LTR lays them out left-to-right and needs the negative offset.
    expect(bannerTrackOffset(0, 'rtl')).toBe('translateX(0%)');
    expect(bannerTrackOffset(1, 'rtl')).toBe('translateX(100%)');
    expect(bannerTrackOffset(3, 'rtl')).toBe('translateX(300%)');
    expect(bannerTrackOffset(0, 'ltr')).toBe('translateX(0%)');
    expect(bannerTrackOffset(1, 'ltr')).toBe('translateX(-100%)');
    expect(bannerTrackOffset(3, 'ltr')).toBe('translateX(-300%)');
  });

  it('hides carousel controls for a single banner', () => {
    render(
      <LanguageProvider>
        <MemoryRouter>
          <BannerCarousel banners={[banner()]} />
        </MemoryRouter>
      </LanguageProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Next banner' })).not.toBeInTheDocument();
    expect(within(document.querySelector('.banner-carousel')!).queryByRole('tab')).toBeNull();
  });
});
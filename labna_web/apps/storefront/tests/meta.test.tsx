import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider, useLanguage } from '../src/i18n';
import { usePageMeta } from '../src/meta';

type Titles = { ar: string; en: string };

/** Renders the hook the way a page does: inside the language provider, with the
 * title resolved through the same translator the pages use. */
function Probe({ titles }: { titles: Titles }) {
  const { t, setLocale } = useLanguage();
  usePageMeta(t(titles.ar, titles.en));
  return (
    <div>
      <button type="button" onClick={() => setLocale('en')}>
        english
      </button>
      <p>{t('محتوى', 'content')}</p>
    </div>
  );
}

const titles = { ar: 'المنتجات', en: 'Products' };

beforeEach(() => {
  document.title = 'متجر لبنة';
  localStorage.clear();
  if (!document.querySelector('meta[name="description"]')) {
    const created = document.createElement('meta');
    created.setAttribute('name', 'description');
    document.head.append(created);
  }
});

describe('usePageMeta', () => {
  it('labels the document with the page title in the active locale', async () => {
    localStorage.setItem('labna.locale', 'en');
    render(
      <LanguageProvider>
        <Probe titles={titles} />
      </LanguageProvider>,
    );
    await waitFor(() => expect(document.title).toBe('Products | لبنة'));
    expect(document.documentElement.lang).toBe('en');
  });

  it('uses the Arabic title when the locale is Arabic', async () => {
    localStorage.setItem('labna.locale', 'ar');
    render(
      <LanguageProvider>
        <Probe titles={titles} />
      </LanguageProvider>,
    );
    await waitFor(() => expect(document.title).toBe('المنتجات | لبنة'));
    expect(document.documentElement.lang).toBe('ar');
  });

  it('falls back to the store name when a page has no title', async () => {
    localStorage.setItem('labna.locale', 'en');
    render(
      <LanguageProvider>
        <Probe titles={{ ar: '', en: '' }} />
      </LanguageProvider>,
    );
    await waitFor(() => expect(document.title).toBe('Labna store | لبنة'));
  });

  it('relabels the document when the shopper switches language', async () => {
    localStorage.setItem('labna.locale', 'ar');
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <Probe titles={titles} />
      </LanguageProvider>,
    );
    expect(await screen.findByRole('button', { name: 'english' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('المنتجات | لبنة'));

    await user.click(screen.getByRole('button', { name: 'english' }));
    await waitFor(() => expect(document.title).toBe('Products | لبنة'));
  });
});

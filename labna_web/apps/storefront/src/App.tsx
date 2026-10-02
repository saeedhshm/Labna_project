import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, NavLink, Outlet, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { LanguageProvider, useLanguage } from './i18n';
import { CatalogPage } from './pages/CatalogPage';
import { HomePage } from './pages/HomePage';
import { ProductPage } from './pages/ProductPage';
import { BranchesPage } from './pages/BranchesPage';
import { CartPlaceholderPage } from './pages/CartPlaceholderPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } },
});

function Layout() {
  const { locale, setLocale, t } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { to: '/', label: t('الرئيسية', 'Home'), end: true },
    { to: '/products', label: t('المنتجات', 'Products') },
    { to: '/branches', label: t('الفروع', 'Branches') },
    { to: '/cart', label: t('السلة', 'Cart') },
  ];

  return (
    <div className="site-shell">
      <header className="topbar">
        <Link className="brand" to="/" onClick={() => setMobileOpen(false)}>
          <img className="brand__mark" src="/labna-icon.png" alt="" />
          <span>
            <strong>{t('لبنة', 'Labna')}</strong>
            <small>{t('ألبان طازجة يوميًا', 'Fresh dairy every day')}</small>
          </span>
        </Link>
        <nav className="nav nav--desktop" aria-label={t('التنقل الرئيسي', 'Main navigation')}>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="topbar__actions">
          <button className="language-toggle" type="button" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}>
            {locale === 'ar' ? 'EN' : 'ع'}
          </button>
          <button className="menu-toggle" type="button" aria-label="القائمة" aria-expanded={mobileOpen} onClick={() => setMobileOpen((v) => !v)}>
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>
      {mobileOpen ? (
        <nav className="nav nav--mobile" aria-label={t('قائمة الجوال', 'Mobile navigation')}>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setMobileOpen(false)}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      ) : null}
      <main>
        <Outlet />
      </main>
      <footer className="footer">
        <p>{t('Demo متجر ألبان كامل للعرض التقني.', 'A full dairy store demo for technical review.')}</p>
      </footer>
    </div>
  );
}

function NotFound() {
  const { t } = useLanguage();
  return (
    <section className="state-card">
      <h1>{t('الصفحة غير موجودة', 'Page not found')}</h1>
      <Link className="button" to="/products">
        {t('تصفح المنتجات', 'Browse products')}
      </Link>
    </section>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/products', element: <CatalogPage /> },
      { path: '/products/:productId', element: <ProductPage /> },
      { path: '/categories/:categoryId', element: <CatalogPage /> },
      { path: '/branches', element: <BranchesPage /> },
      { path: '/cart', element: <CartPlaceholderPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <RouterProvider router={router} />
      </LanguageProvider>
    </QueryClientProvider>
  );
}

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, NavLink, Outlet, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { LanguageProvider, useLanguage } from './i18n';
import { CatalogPage } from './pages/CatalogPage';
import { HomePage } from './pages/HomePage';
import { ProductPage } from './pages/ProductPage';
import { BranchesPage } from './pages/BranchesPage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { ConfirmationPage } from './pages/ConfirmationPage';
import { CartProvider, useCart } from './cart';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } },
});

function Layout() {
  const { locale, setLocale, t } = useLanguage();
  const cart = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { to: '/', label: t('الرئيسية', 'Home'), end: true },
    { to: '/products', label: t('المنتجات', 'Products') },
    { to: '/branches', label: t('الفروع', 'Branches') },
    { to: '/cart', label: t('السلة', 'Cart'), count: cart.count },
  ];

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main">
        {t('تخطي إلى المحتوى', 'Skip to content')}
      </a>
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
              {item.count ? <span className="cart-count">{item.count}</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="topbar__actions">
          <button
            className="language-toggle"
            type="button"
            onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
            aria-label={locale === 'ar' ? t('التبديل إلى الإنجليزية', 'Switch to English') : t('التبديل إلى العربية', 'Switch to Arabic')}
          >
            {locale === 'ar' ? 'EN' : 'ع'}
          </button>
          <button
            className="menu-toggle"
            type="button"
            aria-label={t('القائمة', 'Menu')}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
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
              {item.count ? <span className="cart-count">{item.count}</span> : null}
            </NavLink>
          ))}
        </nav>
      ) : null}
      <main id="main" tabIndex={-1}>
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
      { path: '/cart', element: <CartPage /> },
      { path: '/checkout', element: <CheckoutPage /> },
      { path: '/orders/:orderID', element: <ConfirmationPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <CartProvider>
          <RouterProvider router={router} />
        </CartProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

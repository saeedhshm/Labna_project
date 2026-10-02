import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, Navigate, NavLink, Outlet, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { LanguageProvider, useLanguage } from './i18n';
import { CatalogPage } from './pages/CatalogPage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { ConfirmationPage } from './pages/ConfirmationPage';
import { AccountPage } from './pages/AccountPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { HomePage } from './pages/HomePage';
import { ProductPage } from './pages/ProductPage';
import { CartProvider, useCart } from './cart';
import { CustomerSessionProvider, useCustomerSession } from './customer-session';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } },
});

function Layout() {
  const { locale, setLocale, t } = useLanguage();
  const cart = useCart();
  const session = useCustomerSession();
  const [mobileOpen, setMobileOpen] = useState(false);

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
          <NavLink to="/" end>{t('الرئيسية', 'Home')}</NavLink>
          <NavLink to="/catalog">{t('المنتجات', 'Products')}</NavLink>
          <NavLink to="/cart">{t('السلة', 'Cart')} <span className="cart-count">{cart.count}</span></NavLink>
          <NavLink to={session.state === 'authenticated' ? '/account' : '/login'}>{session.state === 'authenticated' ? t('حسابي', 'Account') : t('دخول', 'Login')}</NavLink>
        </nav>
        <div className="topbar__actions">
          <button className="language-toggle" type="button" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}>
            {locale === 'ar' ? 'EN' : 'ع'}
          </button>
          <button className="menu-toggle" type="button" aria-label="القائمة" onClick={() => setMobileOpen(v => !v)}>
            <span /><span /><span />
          </button>
        </div>
      </header>
      {mobileOpen ? (
        <nav className="nav nav--mobile" aria-label={t('قائمة الجوال', 'Mobile navigation')}>
          <NavLink to="/" end onClick={() => setMobileOpen(false)}>{t('الرئيسية', 'Home')}</NavLink>
          <NavLink to="/catalog" onClick={() => setMobileOpen(false)}>{t('المنتجات', 'Products')}</NavLink>
          <NavLink to="/cart" onClick={() => setMobileOpen(false)}>{t('السلة', 'Cart')} <span className="cart-count">{cart.count}</span></NavLink>
          <NavLink to={session.state === 'authenticated' ? '/account' : '/login'} onClick={() => setMobileOpen(false)}>{session.state === 'authenticated' ? t('حسابي', 'Account') : t('دخول', 'Login')}</NavLink>
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
      <Link className="button" to="/catalog">{t('تصفح المنتجات', 'Browse products')}</Link>
    </section>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/catalog', element: <CatalogPage /> },
      { path: '/cart', element: <CartPage /> },
      { path: '/checkout', element: <CheckoutPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/account', element: <AccountPage /> },
      { path: '/orders/:orderID', element: <ConfirmationPage /> },
      { path: '/categories/:categoryID', element: <CatalogPage /> },
      { path: '/products/:productID', element: <ProductPage /> },
      { path: '/home', element: <Navigate to="/" replace /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <CustomerSessionProvider>
          <CartProvider>
            <RouterProvider router={router} />
          </CartProvider>
        </CustomerSessionProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, Navigate, NavLink, Outlet, RouterProvider, createBrowserRouter, useLocation, useNavigate } from 'react-router-dom';
import { LanguageProvider, useLanguage } from './i18n';
import { CatalogPage } from './pages/CatalogPage';
import { HomePage } from './pages/HomePage';
import { ProductPage } from './pages/ProductPage';
import { BranchesPage } from './pages/BranchesPage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { ConfirmationPage } from './pages/ConfirmationPage';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { AccountPage } from './pages/AccountPage';
import { AddressesPage } from './pages/AddressesPage';
import { OrderDetailPage, OrdersPage } from './pages/OrdersPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { CartProvider, useCart } from './cart';
import { AuthProvider, useAuth } from './auth';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } },
});

function Layout() {
  const { locale, setLocale, t } = useLanguage();
  const auth = useAuth();
  const cart = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  const navItems = [
    { to: '/', label: t('الرئيسية', 'Home'), end: true },
    { to: '/products', label: t('المنتجات', 'Products') },
    { to: '/branches', label: t('الفروع', 'Branches') },
    { to: '/cart', label: t('السلة', 'Cart'), count: cart.count },
  ];

  const logout = async () => {
    setAccountOpen(false);
    await auth.logout();
    setMobileOpen(false);
    navigate('/login', { replace: true });
  };

  const accountLinks = auth.status === 'authenticated' ? [
    { to: '/account', label: t('حسابي', 'My Account') },
    { to: '/account/orders', label: t('طلباتي', 'My Orders') },
    { to: '/account/addresses', label: t('العناوين', 'Addresses') },
    { to: '/account/change-password', label: t('تغيير كلمة المرور', 'Change Password') },
  ] : [];

  useEffect(() => {
    setAccountOpen(false);
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!accountOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (accountMenuRef.current?.contains(event.target as Node)) return;
      setAccountOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [accountOpen]);

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
          {auth.status === 'authenticated' ? (
            <div className="account-menu" ref={accountMenuRef}>
              <button type="button" className="account-menu__trigger" aria-haspopup="menu" aria-expanded={accountOpen} onClick={() => setAccountOpen(open => !open)}>
                {auth.customer?.name ?? t('حسابي', 'Account')}
              </button>
              <div className="account-menu__panel" role="menu" hidden={!accountOpen}>
                {accountLinks.map(item => <Link key={item.to} to={item.to} role="menuitem" onClick={() => setAccountOpen(false)}>{item.label}</Link>)}
                <button type="button" onClick={logout}>{t('تسجيل الخروج', 'Logout')}</button>
              </div>
            </div>
          ) : (
            <Link className="auth-entry" to="/login">{t('دخول / حساب جديد', 'Login / Create Account')}</Link>
          )}
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
          {auth.status === 'authenticated' ? (
            <>
              {accountLinks.map(item => <NavLink key={item.to} to={item.to} onClick={() => setMobileOpen(false)}>{item.label}</NavLink>)}
              <button className="mobile-logout" type="button" onClick={logout}>{t('تسجيل الخروج', 'Logout')}</button>
            </>
          ) : (
            <NavLink to="/login" onClick={() => setMobileOpen(false)}>{t('دخول / حساب جديد', 'Login / Create Account')}</NavLink>
          )}
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

function ProtectedRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  if (auth.status === 'checking') return <section className="state-card"><h1>{t('جارٍ تحميل الحساب', 'Loading account')}</h1></section>;
  if (auth.status === 'unauthenticated') return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  return children;
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

function createRouter() {
  return createBrowserRouter([
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
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/account', element: <ProtectedRoute><AccountPage /></ProtectedRoute> },
      { path: '/account/orders', element: <ProtectedRoute><OrdersPage /></ProtectedRoute> },
      { path: '/account/orders/:orderId', element: <ProtectedRoute><OrderDetailPage /></ProtectedRoute> },
      { path: '/account/addresses', element: <ProtectedRoute><AddressesPage /></ProtectedRoute> },
      { path: '/account/change-password', element: <ProtectedRoute><ChangePasswordPage /></ProtectedRoute> },
      { path: '*', element: <NotFound /> },
    ],
  },
  ]);
}

export function App() {
  const router = useMemo(() => createRouter(), []);
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <AuthProvider>
          <CartProvider>
            <RouterProvider router={router} />
          </CartProvider>
        </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

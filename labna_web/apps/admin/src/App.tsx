import type { ReactNode } from 'react';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './components/AppShell';
import { Spinner } from './components/Primitives';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { ProductsPage } from './pages/ProductsPage';
import { BannersPage } from './pages/BannersPage';
import { BranchesPage } from './pages/BranchesPage';
import { SettingsPage } from './pages/SettingsPage';
import { InventoryPage } from './pages/InventoryPage';
import { OrdersPage } from './pages/OrdersPage';
import { CustomersPage } from './pages/CustomersPage';
import { ToastProvider } from './components/Toasts';
import { SessionProvider, useSession } from './session';

const queryClient = new QueryClient({
  defaultOptions: {
    // Refusing to retry mutations keeps a 409 version conflict visible instead of
    // resubmitting an edit that a colleague has already superseded.
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 10_000 },
    mutations: { retry: false },
  },
});

function Checking() {
  return (
    <div className="gate">
      <Spinner label="جارٍ التحقق من الجلسة…" />
    </div>
  );
}

/** Renders children only for a valid staff session, otherwise sends the user to login. */
function Protected({ children }: { children: ReactNode }) {
  const { state } = useSession();
  if (state === 'checking') return <Checking />;
  if (state === 'anonymous') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** The login screen is unreachable while a session is active. */
function LoginGate() {
  const { state } = useSession();
  if (state === 'checking') return <Checking />;
  if (state === 'authenticated') return <Navigate to="/" replace />;
  return <LoginPage />;
}

function NotFound() {
  return (
    <div className="gate">
      <p>الصفحة غير موجودة.</p>
      <a href="/">العودة إلى النظرة العامة</a>
    </div>
  );
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginGate /> },
  {
    element: (
      <Protected>
        <AppShell />
      </Protected>
    ),
    children: [
      { path: '/', element: <OverviewPage /> },
      { path: '/categories', element: <CategoriesPage /> },
      { path: '/products', element: <ProductsPage /> },
      { path: '/banners', element: <BannersPage /> },
      { path: '/branches', element: <BranchesPage /> },
      { path: '/inventory', element: <InventoryPage /> },
      { path: '/orders', element: <OrdersPage /> },
      { path: '/customers', element: <CustomersPage /> },
      { path: '/customers/:customerId', element: <CustomersPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export function App() {
  return (
    <ToastProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>
    </ToastProvider>
  );
}

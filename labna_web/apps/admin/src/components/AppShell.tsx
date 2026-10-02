import { NavLink, Outlet } from 'react-router-dom';
import { useSession } from '../session';
import { Spinner } from './Primitives';

const navigation = [
  { to: '/', label: 'نظرة عامة', end: true },
  { to: '/categories', label: 'الأقسام' },
  { to: '/products', label: 'المنتجات' },
  { to: '/banners', label: 'البنرات' },
  { to: '/branches', label: 'الفروع' },
  { to: '/inventory', label: 'المخزون' },
  { to: '/settings', label: 'إعدادات المتجر' },
];

export function AppShell() {
  const { signOut } = useSession();
  return (
    <div className="shell">
      <aside className="shell__sidebar">
        <div className="shell__brand">
          <img className="shell__logo" src="/labna-icon.png" alt="" width={40} height={40} />
          <div>
            <strong>لوحة التحكم</strong>
            <small>إدارة المتجر</small>
          </div>
        </div>
        <nav aria-label="أقسام لوحة التحكم">
          <ul>
            {navigation.map(item => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.end}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <button type="button" className="ghost shell__logout" onClick={() => void signOut()}>
          تسجيل الخروج
        </button>
      </aside>
      <main className="shell__main">
        <Outlet />
      </main>
    </div>
  );
}

export function SessionGate() {
  const { state } = useSession();
  if (state === 'checking') {
    return (
      <div className="gate">
        <Spinner label="جارٍ التحقق من الجلسة…" />
      </div>
    );
  }
  return <Outlet />;
}

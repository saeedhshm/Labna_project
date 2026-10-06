import { useEffect, useState } from 'react';
import { useLanguage } from './i18n';

/** Tells the shopper when the connection drops. Checkout stays disabled while
 * offline so an order can never look placed when the request cannot be sent. */
export function OfflineBanner() {
  const { t } = useLanguage();
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;
  return (
    <p className="offline-banner" role="status">
      {t('لا يوجد اتصال بالإنترنت. تتصفح نسخة محفوظة من المنتجات، ولا يمكن إنشاء طلب الآن.', 'You are offline. Browsing cached products; orders cannot be placed right now.')}
    </p>
  );
}

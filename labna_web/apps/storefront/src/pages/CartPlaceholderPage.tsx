import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n';

export function CartPlaceholderPage() {
  const { t } = useLanguage();
  return (
    <section className="state-card">
      <h1>{t('السلة', 'Cart')}</h1>
      <p>{t('ستتوفر السلة قريبًا.', 'Cart will be available soon.')}</p>
      <Link className="button" to="/products">
        {t('تصفح المنتجات', 'Browse products')}
      </Link>
    </section>
  );
}

import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { StateCard } from '../components';
import { useLanguage } from '../i18n';
import { text } from '../types';

export function BranchesPage() {
  const { locale, t } = useLanguage();
  const branches = useQuery({ queryKey: ['branches'], queryFn: ({ signal }) => api.branches(signal) });

  if (branches.isPending)
    return (
      <section className="section">
        <div className="skeleton-lines" />
      </section>
    );
  if (branches.isError) return <StateCard title={t('تعذر تحميل الفروع.', 'Could not load branches.')} />;
  if (branches.data?.data.length === 0) return <StateCard title={t('لا توجد فروع متاحة حاليًا.', 'No branches available yet.')} />;

  return (
    <section className="section">
      <div className="section__head">
        <div>
          <p className="eyebrow">{t('الفروع', 'Branches')}</p>
          <h1>{t('فروعنا', 'Our branches')}</h1>
        </div>
      </div>
      <div className="grid branches-grid">
        {branches.data?.data.map((branch) => (
          <article className="branch-card" key={branch.id}>
            <h2>{text(branch.name, locale)}</h2>
            <p>{text(branch.address, locale)}</p>
            <div className="branch-card__meta">
              <span className={`tag ${branch.isOpen ? 'tag--ok' : 'tag--muted'}`}>{branch.isOpen ? t('مفتوح', 'Open') : t('مغلق', 'Closed')}</span>
              {branch.phoneNumber ? (
                <a href={`tel:${branch.phoneNumber}`} dir="ltr">
                  {branch.phoneNumber}
                </a>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

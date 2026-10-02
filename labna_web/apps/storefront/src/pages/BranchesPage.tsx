import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { BranchCard, StateCard } from '../components';
import { useLanguage } from '../i18n';

export function BranchesPage() {
  const { t } = useLanguage();
  const branches = useQuery({ queryKey: ['branches'], queryFn: ({ signal }) => api.branches(signal) });

  return (
    <section className="section">
      <div className="section__head">
        <div>
          <p className="eyebrow">{t('الفروع', 'Branches')}</p>
          <h1>{t('فروعنا', 'Our branches')}</h1>
        </div>
      </div>

      {branches.isPending ? (
        <div className="grid branches-grid" role="status" aria-label={t('جار تحميل الفروع…', 'Loading branches…')}>
          {Array.from({ length: 2 }, (_, index) => (
            <div className="skeleton-card" key={index} />
          ))}
        </div>
      ) : null}

      {branches.isError ? (
        <StateCard
          title={t('تعذر تحميل الفروع.', 'Could not load branches.')}
          action={
            <button className="button" type="button" onClick={() => void branches.refetch()}>
              {t('إعادة المحاولة', 'Retry')}
            </button>
          }
        />
      ) : null}

      {branches.data?.data.length === 0 && branches.isSuccess ? <StateCard title={t('لا توجد فروع متاحة حاليًا.', 'No branches available yet.')} /> : null}

      <div className="grid branches-grid">
        {branches.data?.data.map((branch) => (
          <BranchCard key={branch.id} branch={branch} />
        ))}
      </div>
    </section>
  );
}
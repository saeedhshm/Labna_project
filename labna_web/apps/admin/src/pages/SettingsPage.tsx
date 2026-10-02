import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { useResourceList, useSettingsMutation, useStoreSettings } from '../api/queries';
import { Field, Notice, Panel, Spinner } from '../components/Primitives';
import { ar } from '../lib/format';
import type { BranchDTO } from '@labna/contracts';

export function SettingsPage() {
  const settings = useStoreSettings();
  const branches = useResourceList<BranchDTO>('branches', 100);
  const mutation = useSettingsMutation();
  const [defaultBranchID, setDefaultBranchID] = useState('');
  const [error, setError] = useState<string>();

  const current = settings.data?.defaultPickupBranchID;
  const version = settings.data?.version ?? 0;

  useEffect(() => {
    if (current) setDefaultBranchID(current);
  }, [current]);

  const options = (branches.data?.pages.flatMap(page => page.items) ?? []).filter(
    branch => branch.isVisible && branch.pickupEnabled,
  );

  return (
    <Panel title="إعدادات المتجر">
      {settings.isPending ? <Spinner label="جارٍ تحميل الإعدادات…" /> : null}
      {settings.isError ? <Notice tone="error">تعذر تحميل الإعدادات.</Notice> : null}
      {settings.data ? (
        <form
          onSubmit={event => {
            event.preventDefault();
            setError(undefined);
            mutation
              .mutateAsync({ version, defaultPickupBranchID: defaultBranchID })
              .catch(failure => setError(failure instanceof ApiError ? failure.message : 'تعذر حفظ الإعدادات.'));
          }}
        >
          <dl className="summary">
            <div>
              <dt>معرّف المتجر</dt>
              <dd><code>{settings.data.id}</code></dd>
            </div>
            <div>
              <dt>العملة</dt>
              <dd><code>{settings.data.currencyCode}</code></dd>
            </div>
            <div>
              <dt>إصدار الإعدادات</dt>
              <dd>{version}</dd>
            </div>
            <div>
              <dt>الطلبات خارج المواعيد</dt>
              <dd>تُقبل وتُعالج عند الفتح التالي</dd>
            </div>
          </dl>
          <Field
            label="فرع الاستلام الافتراضي"
            htmlFor="default-branch"
            hint="يُستخدم عند فتح التطبيق أو الموقع بدون اختيار فرع. لا يمكن اختيار فرع مخفي أو لا يدعم الاستلام."
          >
            <select id="default-branch" value={defaultBranchID} onChange={event => setDefaultBranchID(event.target.value)} required>
              <option value="">اختر الفرع</option>
              {options.map(branch => (
                <option key={branch.id} value={branch.id}>
                  {ar(branch.name)} ({branch.id})
                </option>
              ))}
            </select>
          </Field>
          {branches.hasNextPage ? (
            <button type="button" className="ghost" onClick={() => void branches.fetchNextPage()} disabled={branches.isFetchingNextPage}>
              عرض المزيد من الفروع
            </button>
          ) : null}
          {options.length === 0 ? (
            <Notice tone="error">لا يوجد فرع ظاهر يدعم الاستلام. أضف فرعًا أو فعّل الاستلام أولًا.</Notice>
          ) : null}
          {error ? <Notice tone="error">{error}</Notice> : null}
          <button type="submit" className="primary" disabled={mutation.isPending || options.length === 0}>
            {mutation.isPending ? 'جارٍ الحفظ…' : 'حفظ'}
          </button>
        </form>
      ) : null}
      <section className="settings__next">
        <h3>ما لم يُنفذ بعد</h3>
        <ul className="plain-list">
          <li>بيانات التواصل وسياسات الاستلام: تحتاج إدارة إعدادات كاملة قبل أي طلب.</li>
          <li>تغيير العملة بعد وجود طلبات يتطلب عملية ترحيل مستقلة.</li>
        </ul>
      </section>
    </Panel>
  );
}

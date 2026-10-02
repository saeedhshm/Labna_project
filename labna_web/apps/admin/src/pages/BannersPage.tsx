import { useState } from 'react';
import { id, schemas } from '@labna/contracts';
import { ApiError } from '../api/client';
import { useArchiveMutation, useResourceList, useResourceMutation } from '../api/queries';
import { ConfirmDialog, FormDialog, TextPreview } from '../components/Dialog';
import { LocalizedField } from '../components/LocalizedField';
import { EmptyState, Field, Notice, Panel, Spinner } from '../components/Primitives';
import { ar, en, isBlank } from '../lib/format';

type BannerDTO = {
  id: string;
  version: number;
  title: { ar: string; en: string };
  subtitle: { ar: string; en: string };
  imageURL: string;
  destination: { kind: 'product' | 'category'; id: string };
  sortOrder: number;
  isActive: boolean;
};
type TargetDTO = { id: string; version: number; name: { ar: string; en: string }; publicationStatus?: string };

const emptyDraft = {
  id: '',
  title: { ar: '', en: '' },
  subtitle: { ar: '', en: '' },
  imageURL: '',
  kind: 'category' as 'product' | 'category',
  destinationID: '',
  sortOrder: 0,
  isActive: true,
};

export function BannersPage() {
  const list = useResourceList<BannerDTO>('banners');
  const [editing, setEditing] = useState<BannerDTO | 'new' | null>(null);
  const [archiving, setArchiving] = useState<BannerDTO | null>(null);
  const items = list.data?.pages.flatMap(page => page.items) ?? [];

  return (
    <Panel
      title="بنرات الصفحة الرئيسية"
      actions={
        <button type="button" className="primary" onClick={() => setEditing('new')}>
          بانر جديد
        </button>
      }
    >
      {list.isPending ? <Spinner label="جارٍ تحميل البنرات…" /> : null}
      {list.isError ? <Notice tone="error">تعذر تحميل البنرات.</Notice> : null}
      {items.length === 0 && list.isSuccess ? <EmptyState>لا توجد بنرات. البنرات تظهر أعلى التطبيق والموقع.</EmptyState> : null}
      {items.length > 0 ? (
        <>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">المعرّف</th>
              <th scope="col">العنوان</th>
              <th scope="col">الوجهة</th>
              <th scope="col">الترتيب</th>
              <th scope="col">الحالة</th>
              <th scope="col">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td><code>{item.id}</code></td>
                <td>
                  <TextPreview ar={ar(item.title)} en={en(item.title)} />
                  <small className="hint">{ar(item.subtitle)}</small>
                </td>
                <td>
                  {item.destination.kind === 'product' ? 'منتج' : 'قسم'}: <code>{item.destination.id}</code>
                </td>
                <td>{item.sortOrder}</td>
                <td>{item.isActive ? 'نشط' : 'معطّل'}</td>
                <td className="table__actions">
                  <button type="button" className="ghost" onClick={() => setEditing(item)}>
                    تعديل
                  </button>
                  <button type="button" className="danger-ghost" onClick={() => setArchiving(item)}>
                    أرشفة
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.hasNextPage ? (
          <button type="button" className="ghost" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
            {list.isFetchingNextPage ? 'جارٍ التحميل…' : 'عرض المزيد'}
          </button>
        ) : null}
        </>
      ) : null}
      {editing ? <BannerDialog record={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
      {archiving ? <ArchiveDialog record={archiving} onClose={() => setArchiving(null)} /> : null}
    </Panel>
  );
}

function BannerDialog({ record, onClose }: { record: BannerDTO | null; onClose: () => void }) {
  const categories = useResourceList<TargetDTO>('categories', 100);
  const products = useResourceList<TargetDTO>('products', 100);
  const [draft, setDraft] = useState(() =>
    record
      ? {
          id: record.id,
          title: record.title,
          subtitle: record.subtitle,
          imageURL: record.imageURL,
          kind: record.destination.kind,
          destinationID: record.destination.id,
          sortOrder: record.sortOrder,
          isActive: record.isActive,
        }
      : emptyDraft,
  );
  const [error, setError] = useState<string>();
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const mutation = useResourceMutation('banners');

  const targets = draft.kind === 'product'
    ? (products.data?.pages.flatMap(page => page.items) ?? []).filter(item => item.publicationStatus === 'published')
    : (categories.data?.pages.flatMap(page => page.items) ?? []);

  async function submit() {
    setError(undefined);
    setFieldError({});
    if (isBlank(draft.destinationID)) {
      setFieldError({ 'destination.id': 'اختر الوجهة.' });
      setError('راجع الحقول المميزة ثم حاول مرة أخرى.');
      return;
    }
    const parsed = schemas.banners.safeParse({
      title: draft.title,
      subtitle: draft.subtitle,
      imageURL: draft.imageURL.trim(),
      destination: { kind: draft.kind, id: draft.destinationID },
      sortOrder: draft.sortOrder,
      isActive: draft.isActive,
    });
    if (!parsed.success) {
      setFieldError(Object.fromEntries(parsed.error.issues.map(issue => [issue.path.join('.'), issue.message])));
      setError('راجع الحقول المميزة ثم حاول مرة أخرى.');
      return;
    }
    if (!record && !id.safeParse(draft.id.trim()).success) {
      setFieldError({ id: 'المعرّف يقبل أحرفًا إنجليزية وأرقامًا وشرطات فقط.' });
      setError('راجع المعرّف ثم حاول مرة أخرى.');
      return;
    }
    try {
      await mutation.mutateAsync({
        id: record ? record.id : draft.id.trim(),
        version: record?.version,
        payload: record ? parsed.data : { id: draft.id.trim(), ...parsed.data },
      });
      onClose();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'تعذر حفظ البانر.');
    }
  }

  return (
    <FormDialog
      title={record ? `تعديل البانر ${record.id}` : 'بانر جديد'}
      submitLabel="حفظ"
      onClose={onClose}
      onSubmit={() => void submit()}
      error={error}
      busy={mutation.isPending}
    >
      {record ? null : (
        <Field label="المعرّف" htmlFor="banner-id" error={fieldError.id}>
          <input id="banner-id" dir="ltr" value={draft.id} onChange={event => setDraft({ ...draft, id: event.target.value })} required />
        </Field>
      )}
      <LocalizedField id="banner-title" label="العنوان" value={draft.title} onChange={title => setDraft({ ...draft, title })} error={fieldError['title.ar'] ?? fieldError['title.en']} />
      <LocalizedField id="banner-subtitle" label="العنوان الفرعي" value={draft.subtitle} onChange={subtitle => setDraft({ ...draft, subtitle })} multiline rows={2} error={fieldError['subtitle.ar']} />
      <Field label="رابط الصورة" htmlFor="banner-image" error={fieldError.imageURL}>
        <input id="banner-image" dir="ltr" value={draft.imageURL} onChange={event => setDraft({ ...draft, imageURL: event.target.value })} required />
      </Field>
      <div className="inline-fields">
        <Field label="نوع الوجهة" htmlFor="banner-kind">
          <select
            id="banner-kind"
            value={draft.kind}
            onChange={event => setDraft({ ...draft, kind: event.target.value as 'product' | 'category', destinationID: '' })}
          >
            <option value="category">قسم</option>
            <option value="product">منتج</option>
          </select>
        </Field>
        <Field label="الوجهة" htmlFor="banner-destination" hint="الوجهة يجب أن تكون منشورة." error={fieldError['destination.id']}>
          <select id="banner-destination" value={draft.destinationID} onChange={event => setDraft({ ...draft, destinationID: event.target.value })} required>
            <option value="">اختر</option>
            {targets.map(target => (
              <option key={target.id} value={target.id}>
                {ar(target.name)} ({target.id})
              </option>
            ))}
          </select>
        </Field>
      </div>
      {(draft.kind === 'product' ? products : categories).hasNextPage ? (
        <button type="button" className="ghost" onClick={() => void (draft.kind === 'product' ? products : categories).fetchNextPage()}>
          عرض المزيد من الوجهات
        </button>
      ) : null}
      <div className="inline-fields">
        <Field label="الترتيب" htmlFor="banner-sort" error={fieldError.sortOrder}>
          <input id="banner-sort" type="number" min={0} value={draft.sortOrder} onChange={event => setDraft({ ...draft, sortOrder: Number(event.target.value) })} />
        </Field>
        <label className="toggle">
          <input type="checkbox" checked={draft.isActive} onChange={event => setDraft({ ...draft, isActive: event.target.checked })} />
          نشط
        </label>
      </div>
    </FormDialog>
  );
}

function ArchiveDialog({ record, onClose }: { record: BannerDTO; onClose: () => void }) {
  const [error, setError] = useState<string>();
  const mutation = useArchiveMutation('banners');

  return (
    <ConfirmDialog
      title="أرشفة البانر"
      message={`سيختفي البانر «${ar(record.title)}» من الصفحة الرئيسية.`}
      confirmLabel="أرشفة"
      busy={mutation.isPending}
      error={error}
      onCancel={onClose}
      onConfirm={async () => {
        setError(undefined);
        try {
          await mutation.mutateAsync({ id: record.id, version: record.version });
          onClose();
        } catch (failure) {
          setError(failure instanceof ApiError ? failure.message : 'تعذر أرشفة البانر.');
        }
      }}
    />
  );
}

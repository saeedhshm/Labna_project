import { useState } from 'react';
import { id, schemas } from '@labna/contracts';
import { ApiError } from '../api/client';
import { useArchiveMutation, useResourceList, useResourceMutation } from '../api/queries';
import { ConfirmDialog, FormDialog, TextPreview } from '../components/Dialog';
import { LocalizedField } from '../components/LocalizedField';
import { EmptyState, Field, Notice, Panel, Spinner } from '../components/Primitives';
import { ar, en } from '../lib/format';

type CategoryDTO = { id: string; version: number; name: { ar: string; en: string }; imageURL: string; sortOrder: number };

const emptyDraft = { id: '', name: { ar: '', en: '' }, imageURL: '', sortOrder: 0 };

export function CategoriesPage() {
  const list = useResourceList<CategoryDTO>('categories');
  const [editing, setEditing] = useState<CategoryDTO | 'new' | null>(null);
  const [archiving, setArchiving] = useState<CategoryDTO | null>(null);
  const items = list.data?.pages.flatMap(page => page.items) ?? [];

  return (
    <Panel
      title="الأقسام"
      actions={
        <button type="button" className="primary" onClick={() => setEditing('new')}>
          قسم جديد
        </button>
      }
    >
      {list.isPending ? <Spinner label="جارٍ تحميل الأقسام…" /> : null}
      {list.isError ? <Notice tone="error">تعذر تحميل الأقسام. تأكد من تشغيل الخادم.</Notice> : null}
      {items.length === 0 && list.isSuccess ? (
        <EmptyState>لا توجد أقسام بعد. أضف أول قسم لربط المنتجات به.</EmptyState>
      ) : null}
      {items.length > 0 ? (
        <>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">المعرّف</th>
                <th scope="col">الاسم</th>
                <th scope="col">الترتيب</th>
                <th scope="col">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td><code>{item.id}</code></td>
                  <td><TextPreview ar={ar(item.name)} en={en(item.name)} /></td>
                  <td>{item.sortOrder}</td>
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
          ) : (
            <p className="hint">تم عرض كل الأقسام.</p>
          )}
        </>
      ) : null}
      {editing ? <CategoryDialog record={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
      {archiving ? <ArchiveDialog record={archiving} onClose={() => setArchiving(null)} /> : null}
    </Panel>
  );
}

function CategoryDialog({ record, onClose }: { record: CategoryDTO | null; onClose: () => void }) {
  const [draft, setDraft] = useState(
    record ? { id: record.id, name: record.name, imageURL: record.imageURL, sortOrder: record.sortOrder } : emptyDraft,
  );
  const [error, setError] = useState<string>();
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const mutation = useResourceMutation('categories');

  async function submit() {
    setError(undefined);
    setFieldError({});
    const parsed = schemas.categories.safeParse({ name: draft.name, imageURL: draft.imageURL.trim(), sortOrder: draft.sortOrder });
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
      setError(failure instanceof ApiError ? failure.message : 'تعذر حفظ القسم.');
    }
  }

  return (
    <FormDialog
      title={record ? `تعديل القسم ${record.id}` : 'قسم جديد'}
      submitLabel="حفظ"
      onClose={onClose}
      onSubmit={() => void submit()}
      error={error}
      busy={mutation.isPending}
    >
      {record ? null : (
        <Field label="المعرّف" htmlFor="category-id" hint="أحرف إنجليزية وأرقام وشرطات فقط، ولا يمكن تغييره بعد الإنشاء." error={fieldError.id}>
          <input id="category-id" dir="ltr" value={draft.id} onChange={event => setDraft({ ...draft, id: event.target.value })} required />
        </Field>
      )}
      <LocalizedField
        id="category-name"
        label="الاسم"
        value={draft.name}
        onChange={name => setDraft({ ...draft, name })}
        error={fieldError['name.ar'] ?? fieldError['name.en']}
      />
      <Field label="رابط الصورة" htmlFor="category-image" hint="رابط HTTPS من مضيف الصور المسموح في إعدادات الخادم." error={fieldError.imageURL}>
        <input id="category-image" dir="ltr" value={draft.imageURL} onChange={event => setDraft({ ...draft, imageURL: event.target.value })} required />
      </Field>
      <Field label="الترتيب" htmlFor="category-sort" hint="الأصغر يظهر أولًا." error={fieldError.sortOrder}>
        <input id="category-sort" type="number" min={0} value={draft.sortOrder} onChange={event => setDraft({ ...draft, sortOrder: Number(event.target.value) })} />
      </Field>
    </FormDialog>
  );
}

function ArchiveDialog({ record, onClose }: { record: CategoryDTO; onClose: () => void }) {
  const [error, setError] = useState<string>();
  const mutation = useArchiveMutation('categories');

  return (
    <ConfirmDialog
      title="أرشفة القسم"
      message={`سيختفي القسم «${ar(record.name)}» من التطبيق والموقع. المنتجات المرتبطة تمنع الأرشفة حتى تُنقل أو تُؤرشف.`}
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
          setError(failure instanceof ApiError ? failure.message : 'تعذر أرشفة القسم.');
        }
      }}
    />
  );
}

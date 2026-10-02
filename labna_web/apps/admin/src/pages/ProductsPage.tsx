import { useMemo, useState } from 'react';
import { id, schemas, type ProductDTO } from '@labna/contracts';
import { ApiError } from '../api/client';
import { useArchiveMutation, useResourceList, useResourceMutation, useStoreSettings } from '../api/queries';
import { ConfirmDialog, FormDialog, TextPreview } from '../components/Dialog';
import { LocalizedField } from '../components/LocalizedField';
import { EmptyState, Field, Notice, Panel, Spinner } from '../components/Primitives';
import { VariantEditor } from '../components/VariantEditor';
import { ar, en, money } from '../lib/format';
import type { VariantDraft } from '../lib/forms';

type CategoryDTO = { id: string; version: number; name: { ar: string; en: string } };

const emptyDraft = {
  id: '',
  categoryID: '',
  name: { ar: '', en: '' },
  description: { ar: '', en: '' },
  ingredients: { ar: '', en: '' },
  storageInstructions: { ar: '', en: '' },
  imageURLsText: '',
  isFeatured: false,
  publicationStatus: 'published' as 'draft' | 'published',
  variants: [] as VariantDraft[],
};

export function ProductsPage() {
  const list = useResourceList<ProductDTO>('products');
  const [editing, setEditing] = useState<ProductDTO | 'new' | null>(null);
  const [archiving, setArchiving] = useState<ProductDTO | null>(null);
  const items = list.data?.pages.flatMap(page => page.items) ?? [];

  return (
    <Panel
      title="المنتجات"
      actions={
        <button type="button" className="primary" onClick={() => setEditing('new')}>
          منتج جديد
        </button>
      }
    >
      {list.isPending ? <Spinner label="جارٍ تحميل المنتجات…" /> : null}
      {list.isError ? <Notice tone="error">تعذر تحميل المنتجات.</Notice> : null}
      {items.length === 0 && list.isSuccess ? <EmptyState>لا توجد منتجات بعد.</EmptyState> : null}
      {items.length > 0 ? (
        <>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">المعرّف</th>
                <th scope="col">الاسم</th>
                <th scope="col">القسم</th>
                <th scope="col">الخيارات</th>
                <th scope="col">الحالة</th>
                <th scope="col">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td><code>{item.id}</code></td>
                  <td>
                    <TextPreview ar={ar(item.name)} en={en(item.name)} />
                    {item.isFeatured ? <span className="tag">مميز</span> : null}
                  </td>
                  <td><code>{item.categoryID}</code></td>
                  <td>
                    <ul className="plain-list">
                      {item.variants.map(variant => (
                        <li key={variant.id}>
                          {ar(variant.label) || variant.id} — {money(variant.priceMinor, variant.currencyCode)} {variant.isActive ? '' : '(معطّل)'}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td>
                    <span className={item.publicationStatus === 'published' ? 'tag tag--ok' : 'tag tag--muted'}>
                      {item.publicationStatus === 'published' ? 'منشور' : 'مسودة'}
                    </span>
                  </td>
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
            <p className="hint">تم عرض كل المنتجات.</p>
          )}
        </>
      ) : null}
      {editing ? <ProductDialog record={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
      {archiving ? <ArchiveDialog record={archiving} onClose={() => setArchiving(null)} /> : null}
    </Panel>
  );
}

function ProductDialog({ record, onClose }: { record: ProductDTO | null; onClose: () => void }) {
  const categories = useResourceList<CategoryDTO>('categories', 100);
  const settings = useStoreSettings();
  const [draft, setDraft] = useState(() => {
    if (!record) return emptyDraft;
    return {
      id: record.id,
      categoryID: record.categoryID,
      name: record.name,
      description: record.description,
      ingredients: record.ingredients,
      storageInstructions: record.storageInstructions,
      imageURLsText: record.imageURLs.join('\n'),
      isFeatured: record.isFeatured,
      publicationStatus: record.publicationStatus,
      variants: record.variants.map(variant => ({ ...variant, isNew: false })),
    };
  });
  const [error, setError] = useState<string>();
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const mutation = useResourceMutation('products');
  const categoryOptions = useMemo(() => categories.data?.pages.flatMap(page => page.items) ?? [], [categories.data]);
  const currencyCode = settings.data?.currencyCode ?? 'EGP';

  async function submit() {
    setError(undefined);
    setFieldError({});
    const payload = {
      categoryID: draft.categoryID,
      name: draft.name,
      description: draft.description,
      ingredients: draft.ingredients,
      storageInstructions: draft.storageInstructions,
      imageURLs: draft.imageURLsText.split(/\r?\n/).map(url => url.trim()).filter(Boolean),
      isFeatured: draft.isFeatured,
      publicationStatus: draft.publicationStatus,
      variants: draft.variants.map(({ isNew: _isNew, ...variant }) => variant),
    };
    const parsed = schemas.products.safeParse(payload);
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
      setError(failure instanceof ApiError ? failure.message : 'تعذر حفظ المنتج.');
    }
  }

  return (
    <FormDialog
      title={record ? `تعديل المنتج ${record.id}` : 'منتج جديد'}
      submitLabel="حفظ"
      onClose={onClose}
      onSubmit={() => void submit()}
      error={error}
      busy={mutation.isPending}
    >
      {record ? null : (
        <Field label="المعرّف" htmlFor="product-id" hint="يستخدم في روابط التطبيق والموقع، ولا يمكن تغييره بعد الإنشاء." error={fieldError.id}>
          <input id="product-id" dir="ltr" value={draft.id} onChange={event => setDraft({ ...draft, id: event.target.value })} required />
        </Field>
      )}
      <Field label="القسم" htmlFor="product-category" error={fieldError.categoryID}>
        <select id="product-category" value={draft.categoryID} onChange={event => setDraft({ ...draft, categoryID: event.target.value })} required>
          <option value="">اختر القسم</option>
          {categoryOptions.map(category => (
            <option key={category.id} value={category.id}>
              {ar(category.name)} ({category.id})
            </option>
          ))}
        </select>
      </Field>
      {categories.hasNextPage ? (
        <button type="button" className="ghost" onClick={() => void categories.fetchNextPage()} disabled={categories.isFetchingNextPage}>
          عرض المزيد من الأقسام
        </button>
      ) : null}
      <LocalizedField id="product-name" label="الاسم" value={draft.name} onChange={name => setDraft({ ...draft, name })} error={fieldError['name.ar'] ?? fieldError['name.en']} />
      <LocalizedField id="product-description" label="الوصف" value={draft.description} onChange={description => setDraft({ ...draft, description })} multiline error={fieldError['description.ar']} />
      <LocalizedField id="product-ingredients" label="المكونات" value={draft.ingredients} onChange={ingredients => setDraft({ ...draft, ingredients })} required={false} error={fieldError['ingredients.ar']} />
      <LocalizedField id="product-storage" label="تعليمات الحفظ" value={draft.storageInstructions} onChange={storageInstructions => setDraft({ ...draft, storageInstructions })} required={false} error={fieldError['storageInstructions.ar']} />
      <Field label="روابط الصور" htmlFor="product-images" hint="رابط HTTPS واحد في كل سطر؛ الصورة الأولى أساسية. الروابط من مضيف الصور المسموح فقط." error={fieldError.imageURLs ?? fieldError['imageURLs.0']}>
        <textarea id="product-images" dir="ltr" rows={3} value={draft.imageURLsText} onChange={event => setDraft({ ...draft, imageURLsText: event.target.value })} required />
      </Field>
      <div className="inline-fields">
        <label className="toggle">
          <input type="checkbox" checked={draft.isFeatured} onChange={event => setDraft({ ...draft, isFeatured: event.target.checked })} />
          منتج مميز
        </label>
        <Field label="الحالة" htmlFor="product-status">
          <select id="product-status" value={draft.publicationStatus} onChange={event => setDraft({ ...draft, publicationStatus: event.target.value as 'draft' | 'published' })}>
            <option value="published">منشور</option>
            <option value="draft">مسودة</option>
          </select>
        </Field>
      </div>
      <VariantEditor
        productId={draft.id}
        drafts={draft.variants}
        currencyCode={currencyCode}
        onChange={variants => setDraft({ ...draft, variants })}
      />
    </FormDialog>
  );
}

function ArchiveDialog({ record, onClose }: { record: ProductDTO; onClose: () => void }) {
  const [error, setError] = useState<string>();
  const mutation = useArchiveMutation('products');

  return (
    <ConfirmDialog
      title="أرشفة المنتج"
      message={`سيختفي المنتج «${ar(record.name)}» من التطبيق والموقع. يجب تعطيل كل بنر يشير إليه أولًا. الطلبات السابقة تحتفظ ببياناته.`}
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
          setError(failure instanceof ApiError ? failure.message : 'تعذر أرشفة المنتج.');
        }
      }}
    />
  );
}

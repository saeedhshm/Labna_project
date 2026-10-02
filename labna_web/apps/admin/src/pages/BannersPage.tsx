import { useEffect, useState } from 'react';
import { id, schemas, type BannerTarget } from '@labna/contracts';
import { ApiError } from '../api/client';
import { useArchiveMutation, useResourceList, useResourceMutation } from '../api/queries';
import { ConfirmDialog, FormDialog, TextPreview } from '../components/Dialog';
import { LocalizedField } from '../components/LocalizedField';
import { EmptyState, Field, Notice, Panel, Spinner } from '../components/Primitives';
import { useToast } from '../components/Toasts';
import { ar, en, isBlank } from '../lib/format';

type BannerDTO = {
  id: string;
  version: number;
  title: { ar: string; en: string };
  subtitle: { ar: string; en: string };
  imageURL: string;
  destination: BannerTarget;
  cta?: { ar: string; en: string };
  sortOrder: number;
  isActive: boolean;
};
type TargetDTO = { id: string; version: number; name: { ar: string; en: string }; publicationStatus?: string };

type TargetKind = BannerTarget['kind'];
type Draft = {
  id: string;
  title: { ar: string; en: string };
  subtitle: { ar: string; en: string };
  imageURL: string;
  kind: TargetKind;
  destinationID: string;
  externalURL: string;
  sortOrder: number;
  isActive: boolean;
  ctaAr: string;
  ctaEn: string;
};

const emptyDraft: Draft = {
  id: '',
  title: { ar: '', en: '' },
  subtitle: { ar: '', en: '' },
  imageURL: '',
  kind: 'category',
  destinationID: '',
  externalURL: '',
  sortOrder: 0,
  isActive: true,
  ctaAr: '',
  ctaEn: '',
};

const kindLabels: Record<TargetKind, string> = {
  product: 'منتج',
  category: 'قسم',
  external: 'رابط خارجي',
  none: 'بدون وجهة',
};

/** Human summary of where a banner sends the customer. */
export function targetLabel(target: BannerTarget): string {
  if (target.kind === 'product') return `منتج: ${target.id}`;
  if (target.kind === 'category') return `قسم: ${target.id}`;
  if (target.kind === 'external') return `رابط خارجي: ${target.url}`;
  return 'بدون وجهة';
}

/**
 * Live image preview that degrades to a readable message when the host cannot be
 * reached, so a manager sees a broken asset instead of a silent gap.
 */
function ImagePreview({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  if (!src) return null;
  if (failed) {
    return (
      <p className="field__error" role="alert">
        تعذر تحميل الصورة. تحقق من الرابط.
      </p>
    );
  }
  return <img className="banner-preview" src={src} alt={alt} onError={() => setFailed(true)} />;
}

export function BannersPage() {
  const list = useResourceList<BannerDTO>('banners');
  const { notify } = useToast();
  const [editing, setEditing] = useState<BannerDTO | 'new' | null>(null);
  const [archiving, setArchiving] = useState<BannerDTO | null>(null);
  const toggle = useResourceMutation('banners');
  const items = list.data?.pages.flatMap(page => page.items) ?? [];
  const ordered = [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));

  async function setActive(record: BannerDTO, isActive: boolean) {
    try {
      await toggle.mutateAsync({ id: record.id, version: record.version, payload: { isActive } });
      notify('success', isActive ? `تم تفعيل البانر ${record.id}.` : `تم تعطيل البانر ${record.id}.`);
    } catch (failure) {
      notify('error', failure instanceof ApiError ? failure.message : 'تعذر تغيير حالة البانر.');
    }
  }

  function move(record: BannerDTO, delta: number) {
    const nextOrder = Math.max(0, record.sortOrder + delta);
    if (nextOrder === record.sortOrder) return;
    void toggle
      .mutateAsync({ id: record.id, version: record.version, payload: { sortOrder: nextOrder } })
      .then(() => notify('success', `تم نقل البانر إلى الترتيب ${nextOrder}.`))
      .catch(failure => notify('error', failure instanceof ApiError ? failure.message : 'تعذر تغيير ترتيب البانر.'));
  }

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
          <div className="table-scroll">
            <table className="table banner-table">
              <thead>
                <tr>
                  <th scope="col">الترتيب</th>
                  <th scope="col">المعرّف</th>
                  <th scope="col">العنوان</th>
                  <th scope="col">الوجهة</th>
                  <th scope="col">الحالة</th>
                  <th scope="col">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map(item => (
                  <tr key={item.id}>
                    <td>
                      <span className="order-cell">{item.sortOrder}</span>
                      <span className="table__actions">
                        <button type="button" className="ghost" onClick={() => move(item, -1)} disabled={toggle.isPending} aria-label={`تقليل ترتيب البانر ${item.id}`}>
                          ↑
                        </button>
                        <button type="button" className="ghost" onClick={() => move(item, 1)} disabled={toggle.isPending} aria-label={`زيادة ترتيب البانر ${item.id}`}>
                          ↓
                        </button>
                      </span>
                    </td>
                    <td><code>{item.id}</code></td>
                    <td>
                      <TextPreview ar={ar(item.title)} en={en(item.title)} />
                      <small className="hint">{ar(item.subtitle)}</small>
                      {item.cta ? <small className="hint">زر: {ar(item.cta)}</small> : null}
                    </td>
                    <td>
                      <span className="hint">{targetLabel(item.destination)}</span>
                      <img className="thumb" src={item.imageURL} alt="" loading="lazy" onError={event => ((event.target as HTMLImageElement).style.visibility = 'hidden')} />
                    </td>
                    <td>
                      <span className={`tag ${item.isActive ? 'tag--ok' : 'tag--muted'}`}>{item.isActive ? 'نشط' : 'معطّل'}</span>
                    </td>
                    <td className="table__actions">
                      <button type="button" className="ghost" onClick={() => setEditing(item)}>
                        تعديل
                      </button>
                      <button type="button" className="ghost" onClick={() => void setActive(item, !item.isActive)} disabled={toggle.isPending}>
                        {item.isActive ? 'تعطيل' : 'تفعيل'}
                      </button>
                      <button type="button" className="danger-ghost" onClick={() => setArchiving(item)}>
                        أرشفة
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.hasNextPage ? (
            <button type="button" className="ghost" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
              {list.isFetchingNextPage ? 'جارٍ التحميل…' : 'عرض المزيد'}
            </button>
          ) : (
            <p className="hint">تم عرض كل البنرات.</p>
          )}
        </>
      ) : null}
      {editing ? (
        <BannerDialog record={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
      {archiving ? <ArchiveDialog record={archiving} onClose={() => setArchiving(null)} /> : null}
    </Panel>
  );
}

function BannerDialog({ record, onClose }: { record: BannerDTO | null; onClose: () => void }) {
  const categories = useResourceList<TargetDTO>('categories', 100);
  const products = useResourceList<TargetDTO>('products', 100);
  const { notify } = useToast();
  const [draft, setDraft] = useState<Draft>(() =>
    record
      ? {
          id: record.id,
          title: record.title,
          subtitle: record.subtitle,
          imageURL: record.imageURL,
          kind: record.destination.kind,
          destinationID: record.destination.kind === 'product' || record.destination.kind === 'category' ? record.destination.id : '',
          externalURL: record.destination.kind === 'external' ? record.destination.url : '',
          sortOrder: record.sortOrder,
          isActive: record.isActive,
          ctaAr: record.cta?.ar ?? '',
          ctaEn: record.cta?.en ?? '',
        }
      : emptyDraft,
  );
  const [error, setError] = useState<string>();
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const mutation = useResourceMutation('banners');

  const needsCatalogTarget = draft.kind === 'product' || draft.kind === 'category';
  const targets = draft.kind === 'product'
    ? (products.data?.pages.flatMap(page => page.items) ?? []).filter(item => item.publicationStatus === 'published')
    : (categories.data?.pages.flatMap(page => page.items) ?? []);
  const targetList = draft.kind === 'product' ? products : categories;

  async function submit() {
    setError(undefined);
    setFieldError({});
    const destination: BannerTarget =
      draft.kind === 'external'
        ? { kind: 'external', url: draft.externalURL.trim() }
        : draft.kind === 'none'
          ? { kind: 'none' }
          : { kind: draft.kind, id: draft.destinationID };
    const cta = isBlank(draft.ctaAr) && isBlank(draft.ctaEn) ? undefined : { ar: draft.ctaAr.trim(), en: draft.ctaEn.trim() };
    const payload = {
      title: draft.title,
      subtitle: draft.subtitle,
      imageURL: draft.imageURL.trim(),
      destination,
      ...(cta ? { cta } : {}),
      sortOrder: draft.sortOrder,
      isActive: draft.isActive,
    };
    const parsed = schemas.banners.safeParse(payload);
    if (!parsed.success) {
      setFieldError(Object.fromEntries(parsed.error.issues.map(issue => [issue.path.join('.'), issue.message])));
      setError('راجع الحقول المميزة ثم حاول مرة أخرى.');
      return;
    }
    if (needsCatalogTarget && isBlank(draft.destinationID)) {
      setFieldError({ 'destination.id': 'اختر الوجهة.' });
      setError('راجع الوجهة ثم حاول مرة أخرى.');
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
      notify('success', record ? 'تم تحديث البانر.' : 'تم إنشاء البانر.');
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
      <Field label="رابط الصورة" htmlFor="banner-image" hint="HTTPS من مضيف مسموح." error={fieldError.imageURL}>
        <input id="banner-image" dir="ltr" value={draft.imageURL} onChange={event => setDraft({ ...draft, imageURL: event.target.value })} required />
        <ImagePreview src={draft.imageURL.trim()} alt="معاينة صورة البانر" />
      </Field>

      <Field label="نوع الوجهة" htmlFor="banner-kind" hint="يحدد سلوك المتجر عند الضغط على البانر.">
        <select
          id="banner-kind"
          value={draft.kind}
          onChange={event => setDraft({ ...draft, kind: event.target.value as TargetKind, destinationID: '', externalURL: '' })}
        >
          {(Object.keys(kindLabels) as TargetKind[]).map(kind => (
            <option key={kind} value={kind}>
              {kindLabels[kind]}
            </option>
          ))}
        </select>
      </Field>

      {needsCatalogTarget ? (
        <Field label="الوجهة" htmlFor="banner-destination" hint="الوجهة يجب أن تكون منشورة." error={fieldError['destination.id'] ?? fieldError['destination.url']}>
          <select id="banner-destination" value={draft.destinationID} onChange={event => setDraft({ ...draft, destinationID: event.target.value })} required>
            <option value="">اختر</option>
            {targets.map(target => (
              <option key={target.id} value={target.id}>
                {ar(target.name)} ({target.id})
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {draft.kind === 'external' ? (
        <Field label="رابط الوجهة" htmlFor="banner-external" hint="يجب أن يبدأ بـ https." error={fieldError['destination.url']}>
          <input id="banner-external" dir="ltr" placeholder="https://example.com" value={draft.externalURL} onChange={event => setDraft({ ...draft, externalURL: event.target.value })} required />
        </Field>
      ) : null}

      {targetList.hasNextPage ? (
        <button type="button" className="ghost" onClick={() => void targetList.fetchNextPage()} disabled={targetList.isFetchingNextPage}>
          {targetList.isFetchingNextPage ? 'جارٍ التحميل…' : 'عرض المزيد من الوجهات'}
        </button>
      ) : null}

      <LocalizedField
        id="banner-cta"
        label="نص الزر (اختياري)"
        value={{ ar: draft.ctaAr, en: draft.ctaEn }}
        onChange={cta => setDraft({ ...draft, ctaAr: cta.ar, ctaEn: cta.en })}
        required={false}
        error={fieldError['cta.ar'] ?? fieldError['cta.en']}
      />

      <div className="inline-fields">
        <Field label="الترتيب" htmlFor="banner-sort" hint="الأصغر يظهر أولًا." error={fieldError.sortOrder}>
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
  const { notify } = useToast();
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
          notify('success', 'تمت أرشفة البانر.');
          onClose();
        } catch (failure) {
          setError(failure instanceof ApiError ? failure.message : 'تعذر أرشفة البانر.');
        }
      }}
    />
  );
}
import { useState } from 'react';
import { id, schemas, type BranchDTO } from '@labna/contracts';
import { ApiError } from '../api/client';
import { useArchiveMutation, useResourceList, useResourceMutation } from '../api/queries';
import { ConfirmDialog, FormDialog, TextPreview } from '../components/Dialog';
import { LocalizedField } from '../components/LocalizedField';
import { OpeningHoursEditor, branchPayload, fromOpeningHours, timezones } from '../components/OpeningHoursEditor';
import { EmptyState, Field, Notice, Panel, Spinner } from '../components/Primitives';
import { useToast } from '../components/Toasts';
import { ar, en, isBlank } from '../lib/format';
import { emptySchedule, validateSchedule, weekdayLabel, type DateOverride, type Schedule } from '../lib/forms';

const emptyDraft = {
  id: '',
  name: { ar: '', en: '' },
  address: { ar: '', en: '' },
  latitude: '',
  longitude: '',
  phoneNumber: '',
  timeZoneIdentifier: 'Africa/Cairo',
  isVisible: true,
  pickupEnabled: true,
  acceptsOrders: true,
};

export function BranchesPage() {
  const list = useResourceList<BranchDTO>('branches');
  const { notify } = useToast();
  const [editing, setEditing] = useState<BranchDTO | 'new' | null>(null);
  const [archiving, setArchiving] = useState<BranchDTO | null>(null);
  const toggle = useResourceMutation('branches');
  const items = list.data?.pages.flatMap(page => page.items) ?? [];

  async function setVisible(record: BranchDTO, isVisible: boolean) {
    try {
      await toggle.mutateAsync({ id: record.id, version: record.version, payload: { isVisible } });
      notify('success', isVisible ? `تم إظهار الفرع ${record.id}.` : `تم إخفاء الفرع ${record.id}.`);
    } catch (failure) {
      notify('error', failure instanceof ApiError ? failure.message : 'تعذر تغيير حالة الفرع.');
    }
  }

  return (
    <Panel
      title="الفروع"
      actions={
        <button type="button" className="primary" onClick={() => setEditing('new')}>
          فرع جديد
        </button>
      }
    >
      {list.isPending ? <Spinner label="جارٍ تحميل الفروع…" /> : null}
      {list.isError ? <Notice tone="error">تعذر تحميل الفروع.</Notice> : null}
      {items.length === 0 && list.isSuccess ? (
        <EmptyState>لا توجد فروع. أنشئ فرعًا واحدًا على الأقل، ثم حدّده كفرع الاستلام الافتراضي في إعدادات المتجر.</EmptyState>
      ) : null}
      {items.length > 0 ? (
        <>
        <div className="table-scroll">
          <table className="table branch-table">
          <thead>
            <tr>
              <th scope="col">المعرّف</th>
              <th scope="col">الاسم</th>
              <th scope="col">العنوان</th>
              <th scope="col">الهاتف</th>
              <th scope="col">الموقع</th>
              <th scope="col">المواعيد</th>
              <th scope="col">الحالة</th>
              <th scope="col">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td><code>{item.id}</code></td>
                <td><TextPreview ar={ar(item.name)} en={en(item.name)} /></td>
                <td>{ar(item.address)}</td>
                <td dir="ltr">{item.phoneNumber ?? <span className="hint">—</span>}</td>
                <td dir="ltr" className="stock-number">
                  {item.coordinate.latitude.toFixed(4)}, {item.coordinate.longitude.toFixed(4)}
                </td>
                <td className="hint">{scheduleSummary(item)}</td>
                <td>
                  <span className={`tag ${item.isVisible ? 'tag--ok' : 'tag--muted'}`}>{item.isVisible ? 'ظاهر' : 'مخفي'}</span>
                  <small className="hint">{item.pickupEnabled ? (item.acceptsOrders ? 'يستقبل طلبات' : 'موقوف مؤقتًا') : 'للعرض فقط'}</small>
                </td>
                <td className="table__actions">
                  <button type="button" className="ghost" onClick={() => setEditing(item)}>
                    تعديل
                  </button>
                  <button type="button" className="ghost" onClick={() => void setVisible(item, !item.isVisible)} disabled={toggle.isPending}>
                    {item.isVisible ? 'إخفاء' : 'إظهار'}
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
          <p className="hint">تم عرض كل الفروع.</p>
        )}
        </>
      ) : null}
      {editing ? <BranchDialog record={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
      {archiving ? <ArchiveDialog record={archiving} onClose={() => setArchiving(null)} /> : null}
    </Panel>
  );
}

/** Compact "N days/week · HH:MM–HH:MM" hint so the table shows real schedule data. */
function scheduleSummary(record: BranchDTO): string {
  const days = new Set(record.openingHours.map(item => item.weekday)).size;
  if (days === 0) return 'غير منشورة';
  const first = [...record.openingHours].sort((a, b) => a.weekday - b.weekday || a.opensAt.localeCompare(b.opensAt))[0];
  return first ? `${days} أيام · ${first.opensAt}–${first.closesAt}` : `${days} أيام`;
}

function BranchDialog({ record, onClose }: { record: BranchDTO | null; onClose: () => void }) {
  const { notify } = useToast();
  const [draft, setDraft] = useState(() =>
    record
      ? {
          id: record.id,
          name: record.name,
          address: record.address,
          latitude: String(record.coordinate.latitude),
          longitude: String(record.coordinate.longitude),
          phoneNumber: record.phoneNumber ?? '',
          timeZoneIdentifier: record.timeZoneIdentifier,
          isVisible: record.isVisible,
          pickupEnabled: record.pickupEnabled,
          acceptsOrders: record.acceptsOrders,
        }
      : emptyDraft,
  );
  const [schedule, setSchedule] = useState<Schedule[]>(record ? fromOpeningHours(record.openingHours) : emptySchedule());
  const [overrides, setOverrides] = useState<DateOverride[]>(record ? record.dateOverrides : []);
  const [error, setError] = useState<string>();
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const mutation = useResourceMutation('branches');

  async function submit() {
    setError(undefined);
    setFieldError({});
    const scheduleProblems = validateSchedule([
      ...schedule.map(day => ({ label: weekdayLabel(day.weekday), intervals: day.intervals })),
      ...overrides.map(day => ({ label: day.date, intervals: day.intervals })),
    ]);
    if (scheduleProblems.length || new Set(overrides.map(item => item.date)).size !== overrides.length) {
      setError(scheduleProblems[0] ?? 'يوجد تاريخ استثناء مكرر.');
      return;
    }
    const base = {
      name: draft.name,
      address: draft.address,
      coordinate: { latitude: Number(draft.latitude), longitude: Number(draft.longitude) },
      phoneNumber: isBlank(draft.phoneNumber) ? null : draft.phoneNumber.trim(),
      timeZoneIdentifier: draft.timeZoneIdentifier,
      isVisible: draft.isVisible,
      pickupEnabled: draft.pickupEnabled,
      acceptsOrders: draft.acceptsOrders,
    };
    const parsed = schemas.branches.safeParse(branchPayload(base, schedule, overrides));
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
      notify('success', record ? 'تم تحديث الفرع.' : 'تم إنشاء الفرع.');
      onClose();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'تعذر حفظ الفرع.');
    }
  }

  return (
    <FormDialog
      title={record ? `تعديل الفرع ${record.id}` : 'فرع جديد'}
      submitLabel="حفظ"
      onClose={onClose}
      onSubmit={() => void submit()}
      error={error}
      busy={mutation.isPending}
    >
      {record ? null : (
        <Field label="المعرّف" htmlFor="branch-id" error={fieldError.id}>
          <input id="branch-id" dir="ltr" value={draft.id} onChange={event => setDraft({ ...draft, id: event.target.value })} required />
        </Field>
      )}
      <LocalizedField id="branch-name" label="الاسم" value={draft.name} onChange={name => setDraft({ ...draft, name })} error={fieldError['name.ar'] ?? fieldError['name.en']} />
      <LocalizedField id="branch-address" label="العنوان" value={draft.address} onChange={address => setDraft({ ...draft, address })} multiline rows={2} error={fieldError['address.ar']} />
      <div className="inline-fields">
        <Field label="خط العرض" htmlFor="branch-latitude" error={fieldError['coordinate.latitude']}>
          <input id="branch-latitude" type="number" step="any" dir="ltr" value={draft.latitude} onChange={event => setDraft({ ...draft, latitude: event.target.value })} required />
        </Field>
        <Field label="خط الطول" htmlFor="branch-longitude" error={fieldError['coordinate.longitude']}>
          <input id="branch-longitude" type="number" step="any" dir="ltr" value={draft.longitude} onChange={event => setDraft({ ...draft, longitude: event.target.value })} required />
        </Field>
      </div>
      <div className="inline-fields">
        <Field label="رقم الهاتف" htmlFor="branch-phone" hint="بصيغة دولية، أو اتركه فارغًا." error={fieldError.phoneNumber}>
          <input id="branch-phone" dir="ltr" value={draft.phoneNumber} onChange={event => setDraft({ ...draft, phoneNumber: event.target.value })} placeholder="+201001234567" />
        </Field>
        <Field label="المنطقة الزمنية" htmlFor="branch-timezone" hint="اسم IANA مثل Africa/Cairo؛ الاقتراحات ليست حصرًا." error={fieldError.timeZoneIdentifier}>
          <input id="branch-timezone" list="branch-timezones" dir="ltr" value={draft.timeZoneIdentifier} onChange={event => setDraft({ ...draft, timeZoneIdentifier: event.target.value })} required />
          <datalist id="branch-timezones">{timezones.map(zone => <option key={zone} value={zone} />)}</datalist>
        </Field>
      </div>
      <div className="inline-fields">
        <label className="toggle">
          <input type="checkbox" checked={draft.isVisible} onChange={event => setDraft({ ...draft, isVisible: event.target.checked })} />
          ظاهر للعملاء
        </label>
        <label className="toggle">
          <input type="checkbox" checked={draft.pickupEnabled} onChange={event => setDraft({ ...draft, pickupEnabled: event.target.checked })} />
          يدعم الاستلام
        </label>
        <label className="toggle">
          <input type="checkbox" checked={draft.acceptsOrders} disabled={!draft.pickupEnabled} onChange={event => setDraft({ ...draft, acceptsOrders: event.target.checked })} />
          يقبل طلبات جديدة
        </label>
      </div>
      <OpeningHoursEditor
        schedule={schedule}
        overrides={overrides}
        onChangeSchedule={setSchedule}
        onChangeOverrides={setOverrides}
      />
    </FormDialog>
  );
}

function ArchiveDialog({ record, onClose }: { record: BranchDTO; onClose: () => void }) {
  const [error, setError] = useState<string>();
  const { notify } = useToast();
  const mutation = useArchiveMutation('branches');

  return (
    <ConfirmDialog
      title="أرشفة الفرع"
      message={`سيختفي الفرع «${ar(record.name)}» من التطبيق والموقع. فرع الاستلام الافتراضي أو أي فرع بكميات محجوزة لا يمكن أرشفته.`}
      confirmLabel="أرشفة"
      busy={mutation.isPending}
      error={error}
      onCancel={onClose}
      onConfirm={async () => {
        setError(undefined);
        try {
          await mutation.mutateAsync({ id: record.id, version: record.version });
          notify('success', 'تمت أرشفة الفرع.');
          onClose();
        } catch (failure) {
          setError(failure instanceof ApiError ? failure.message : 'تعذر أرشفة الفرع.');
        }
      }}
    />
  );
}

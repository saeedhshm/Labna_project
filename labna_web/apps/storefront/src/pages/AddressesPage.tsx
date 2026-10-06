import { useEffect, useId, useState, type FormEvent } from 'react';
import type { CustomerAddressDTO, CustomerAddressInput } from '@labna/contracts';
import { customerAddressInput } from '@labna/contracts';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { useLanguage } from '../i18n';
import { usePageMeta } from '../meta';

type FormErrors = Record<string, string>;
type AddressForm = Record<Exclude<keyof CustomerAddressInput, 'isDefault'>, string> & { isDefault: boolean };

const blankAddress = (name = '', phone = ''): AddressForm => ({
  label: '',
  recipientName: name,
  phoneNumber: phone,
  city: '',
  area: '',
  street: '',
  building: '',
  floor: '',
  apartment: '',
  notes: '',
  isDefault: false,
});

const toForm = (address: CustomerAddressDTO): AddressForm => ({
  label: address.label,
  recipientName: address.recipientName ?? '',
  phoneNumber: address.phoneNumber ?? '',
  city: address.city,
  area: address.area,
  street: address.street,
  building: address.building,
  floor: address.floor ?? '',
  apartment: address.apartment ?? '',
  notes: address.notes ?? '',
  isDefault: address.isDefault,
});

const payload = (values: AddressForm) => ({
  ...values,
  recipientName: values.recipientName.trim() || undefined,
  phoneNumber: values.phoneNumber.trim() || undefined,
});

const serverMessage = (error: unknown, t: (ar: string, en: string) => string) => {
  if (!(error instanceof ApiError)) return t('تعذر الاتصال بالخادم. حاول مرة أخرى.', 'Could not reach the server. Try again.');
  if (error.code === 'VALIDATION_ERROR') return t('راجع بيانات العنوان وحاول مرة أخرى.', 'Check the address details and try again.');
  if (error.status === 401) return t('انتهت الجلسة. سجل الدخول مرة أخرى.', 'Your session expired. Please log in again.');
  return error.message || t('حدث خطأ غير متوقع.', 'Something went wrong.');
};

export function AddressesPage() {
  const { t } = useLanguage();
  usePageMeta(t('العناوين', 'Addresses'));
  const auth = useAuth();
  const form = useId();
  const customer = auth.customer!;
  const token = auth.accessToken;
  const addresses = customer.addresses ?? [];
  const [editingID, setEditingID] = useState<string | null>(null);
  const [values, setValues] = useState<AddressForm>(() => blankAddress(customer.name, customer.phoneNumber));
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (editingID) return;
    setValues(blankAddress(customer.name, customer.phoneNumber));
  }, [customer.name, customer.phoneNumber, editingID]);

  const field = (name: string) => `${form}-${name}`;
  const reset = () => {
    setEditingID(null);
    setValues(blankAddress(customer.name, customer.phoneNumber));
    setErrors({});
    setFormError('');
  };
  const edit = (address: CustomerAddressDTO) => {
    setEditingID(address.id);
    setValues(toForm(address));
    setErrors({});
    setFormError('');
    setSuccess('');
  };
  const mutate = async (name: string, action: () => Promise<unknown>, message: string) => {
    if (!token) return;
    setBusy(name);
    setFormError('');
    setSuccess('');
    try {
      await action();
      await auth.reloadCustomer();
      setSuccess(message);
      if (name === 'save') reset();
    } catch (error) {
      setFormError(serverMessage(error, t));
    } finally {
      setBusy(null);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body = payload(values);
    const parsed = customerAddressInput.safeParse(body);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])));
      return;
    }
    setErrors({});
    await mutate('save', () => (editingID ? api.customerUpdateAddress(token!, editingID, parsed.data) : api.customerCreateAddress(token!, parsed.data)), t('تم حفظ العنوان.', 'Address saved.'));
  };
  const setDefault = (address: CustomerAddressDTO) =>
    mutate(`default:${address.id}`, () => api.customerSetDefaultAddress(token!, address.id), t('تم تحديث العنوان الافتراضي.', 'Default address updated.'));
  const remove = (address: CustomerAddressDTO) => {
    if (!window.confirm(t('هل تريد حذف هذا العنوان؟', 'Delete this address?'))) return;
    void mutate(`delete:${address.id}`, () => api.customerDeleteAddress(token!, address.id), t('تم حذف العنوان.', 'Address deleted.'));
  };

  return (
    <section className="section account-page" aria-labelledby="addresses-title">
      <div className="section__head">
        <div>
          <p className="eyebrow">{t('منطقة العملاء', 'Customer area')}</p>
          <h1 id="addresses-title">{t('العناوين', 'Addresses')}</h1>
        </div>
      </div>
      <div className="address-layout">
        <div className="address-list" aria-live="polite">
          {addresses.length ? (
            addresses.map((address) => (
              <article className="address-card" key={address.id}>
                <div className="address-card__head">
                  <h2>{address.label}</h2>
                  {address.isDefault ? <span className="default-badge">{t('افتراضي', 'Default')}</span> : null}
                </div>
                <p>
                  <strong>{address.recipientName || customer.name}</strong> <span dir="ltr">{address.phoneNumber || customer.phoneNumber}</span>
                </p>
                <p>
                  {address.city}, {address.area}, {address.street}, {address.building}
                </p>
                {[address.floor, address.apartment, address.notes].filter(Boolean).length ? <p>{[address.floor, address.apartment, address.notes].filter(Boolean).join(' · ')}</p> : null}
                <div className="address-card__actions">
                  <button type="button" onClick={() => edit(address)}>
                    {t('تعديل', 'Edit')}
                  </button>
                  <button type="button" onClick={() => void setDefault(address)} disabled={address.isDefault || busy === `default:${address.id}`}>
                    {t('تعيين كافتراضي', 'Set as Default')}
                  </button>
                  <button className="danger-action" type="button" onClick={() => remove(address)} disabled={busy === `delete:${address.id}`}>
                    {t('حذف', 'Delete')}
                  </button>
                </div>
              </article>
            ))
          ) : (
            <section className="state-card">
              <h2>{t('لا توجد عناوين محفوظة', 'No saved addresses')}</h2>
              <p>{t('أضف عنوانًا ليصبح جاهزًا للاستخدام لاحقًا في Checkout.', 'Add an address so checkout can use it later.')}</p>
            </section>
          )}
        </div>

        <form className="auth-card address-form" onSubmit={submit} noValidate aria-labelledby="address-form-title">
          <p className="eyebrow">{editingID ? t('تعديل عنوان', 'Edit Address') : t('عنوان جديد', 'Add Address')}</p>
          <h2 id="address-form-title">{editingID ? t('تعديل العنوان', 'Edit address') : t('إضافة عنوان', 'Add address')}</h2>
          {formError ? (
            <p className="form-alert" role="alert">
              {formError}
            </p>
          ) : null}
          {success ? (
            <p className="form-success" role="status">
              {success}
            </p>
          ) : null}
          {[
            ['label', t('اسم العنوان', 'Address label'), 'text', 'Home'],
            ['recipientName', t('اسم المستلم', 'Recipient name'), 'text', customer.name],
            ['phoneNumber', t('رقم الهاتف', 'Phone number'), 'tel', customer.phoneNumber],
            ['city', t('المدينة', 'City'), 'text', 'Cairo'],
            ['area', t('المنطقة', 'Area'), 'text', 'Maadi'],
            ['street', t('الشارع', 'Street'), 'text', 'Road 9'],
            ['building', t('المبنى', 'Building'), 'text', '12'],
            ['floor', t('الدور', 'Floor'), 'text', '3'],
            ['apartment', t('الشقة', 'Apartment'), 'text', '5'],
          ].map(([name, label, type, placeholder]) => (
            <div className="auth-field" key={name}>
              <label htmlFor={field(name)}>{label}</label>
              <input
                id={field(name)}
                type={type}
                placeholder={placeholder}
                value={values[name as keyof AddressForm] as string}
                aria-invalid={Boolean(errors[name])}
                aria-describedby={errors[name] ? field(`${name}-error`) : undefined}
                onChange={(event) => setValues({ ...values, [name]: event.target.value })}
              />
              {errors[name] ? (
                <span id={field(`${name}-error`)} className="field-error">
                  {errors[name]}
                </span>
              ) : null}
            </div>
          ))}
          <div className="auth-field">
            <label htmlFor={field('notes')}>{t('ملاحظات إضافية', 'Additional notes')}</label>
            <textarea id={field('notes')} value={values.notes} onChange={(event) => setValues({ ...values, notes: event.target.value })} />
          </div>
          <label className="check-filter">
            <input type="checkbox" checked={values.isDefault} onChange={(event) => setValues({ ...values, isDefault: event.target.checked })} /> {t('اجعله العنوان الافتراضي', 'Make default address')}
          </label>
          <button className="button button--wide" type="submit" disabled={busy === 'save'}>
            {busy === 'save' ? t('جارٍ الحفظ...', 'Saving...') : editingID ? t('حفظ التعديلات', 'Save changes') : t('إضافة العنوان', 'Add Address')}
          </button>
          {editingID ? (
            <button className="button button--wide secondary-button" type="button" onClick={reset} disabled={busy === 'save'}>
              {t('إلغاء التعديل', 'Cancel edit')}
            </button>
          ) : null}
        </form>
      </div>
    </section>
  );
}

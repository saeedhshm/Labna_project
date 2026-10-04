import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { customerProfilePatch } from '@labna/contracts';
import { ApiError } from '../api';
import { useAuth } from '../auth';
import { useLanguage } from '../i18n';

type FormErrors = Record<string, string>;

const serverMessage = (error: unknown, t: (ar: string, en: string) => string) => {
  if (!(error instanceof ApiError)) return t('تعذر الاتصال بالخادم. حاول مرة أخرى.', 'Could not reach the server. Try again.');
  if (error.code === 'DUPLICATE_RESOURCE') return t('يوجد حساب بهذا البريد الإلكتروني بالفعل.', 'An account with this email already exists.');
  if (error.code === 'VALIDATION_ERROR') return t('راجع الحقول وحاول مرة أخرى.', 'Check the fields and try again.');
  if (error.status === 401) return t('انتهت الجلسة. سجل الدخول مرة أخرى.', 'Your session expired. Please log in again.');
  return error.message || t('حدث خطأ غير متوقع.', 'Something went wrong.');
};

export function AccountPage() {
  const { t } = useLanguage();
  const auth = useAuth();
  const navigate = useNavigate();
  const form = useId();
  const customer = auth.customer;
  const [values, setValues] = useState({ name: customer?.name ?? '', email: customer?.email ?? '', phoneNumber: customer?.phoneNumber ?? '' });
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!customer || saving) return;
    setValues({ name: customer.name, email: customer.email, phoneNumber: customer.phoneNumber });
  }, [customer, saving]);

  if (!customer) return null;

  const field = (name: string) => `${form}-${name}`;
  const logout = async () => {
    await auth.logout();
    navigate('/login', { replace: true });
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    setSuccess('');
    const parsed = customerProfilePatch.safeParse(values);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.message])));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await auth.updateProfile(parsed.data);
      setSuccess(t('تم حفظ بيانات الحساب.', 'Account details saved.'));
    } catch (error) {
      setFormError(serverMessage(error, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="section account-page" aria-labelledby="account-title">
      <div className="account-layout">
        <aside className="account-summary" aria-label={t('ملخص الحساب', 'Account summary')}>
          <p className="eyebrow">{t('منطقة العملاء', 'Customer area')}</p>
          <h1 id="account-title">{t('حسابي', 'My Account')}</h1>
          <dl>
            <div><dt>{t('الاسم', 'Name')}</dt><dd>{customer.name}</dd></div>
            <div><dt>{t('البريد الإلكتروني', 'Email')}</dt><dd>{customer.email}</dd></div>
            <div><dt>{t('الهاتف', 'Phone')}</dt><dd dir="ltr">{customer.phoneNumber}</dd></div>
          </dl>
          <nav className="account-nav" aria-label={t('تنقل الحساب', 'Account navigation')}>
            <a href="#profile-form">{t('الملف الشخصي', 'Profile')}</a>
            <Link to="/account/addresses">{t('العناوين', 'Addresses')}</Link>
            <Link to="/account/orders">{t('طلباتي', 'My Orders')}</Link>
            <Link to="/account/change-password">{t('تغيير كلمة المرور', 'Change Password')}</Link>
            <button type="button" onClick={logout}>{t('تسجيل الخروج', 'Logout')}</button>
          </nav>
        </aside>

        <form id="profile-form" className="auth-card account-form" onSubmit={submit} noValidate aria-labelledby="profile-title">
          <p className="eyebrow">{t('الملف الشخصي', 'Profile')}</p>
          <h2 id="profile-title">{t('تعديل بيانات الحساب', 'Edit profile')}</h2>
          <p className="hint">{t('يمكنك تعديل الاسم والبريد الإلكتروني ورقم الهاتف فقط.', 'You can edit only your name, email, and phone number.')}</p>
          {formError ? <p className="form-alert" role="alert">{formError}</p> : null}
          {success ? <p className="form-success" role="status">{success}</p> : null}

          {[
            ['name', t('الاسم', 'Name'), 'text', 'name'],
            ['email', t('البريد الإلكتروني', 'Email'), 'email', 'email'],
            ['phoneNumber', t('رقم الهاتف', 'Phone number'), 'tel', 'tel'],
          ].map(([name, label, type, autoComplete]) => (
            <div className="auth-field" key={name}>
              <label htmlFor={field(name)}>{label}</label>
              <input id={field(name)} type={type} autoComplete={autoComplete} value={values[name as keyof typeof values]} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? field(`${name}-error`) : undefined} onChange={event => setValues({ ...values, [name]: event.target.value })} />
              {errors[name] ? <span id={field(`${name}-error`)} className="field-error">{errors[name]}</span> : null}
            </div>
          ))}

          <button className="button button--wide" type="submit" disabled={saving}>{saving ? t('جارٍ الحفظ...', 'Saving...') : t('حفظ التغييرات', 'Save changes')}</button>
        </form>
      </div>
    </section>
  );
}

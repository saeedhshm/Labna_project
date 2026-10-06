import { useId, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { customerPasswordPatch } from '@labna/contracts';
import { ApiError } from '../api';
import { useAuth } from '../auth';
import { useLanguage } from '../i18n';
import { usePageMeta } from '../meta';

type FormErrors = Record<string, string>;

function serverMessage(error: unknown, t: (ar: string, en: string) => string) {
  if (!(error instanceof ApiError)) return t('تعذر الاتصال بالخادم. حاول مرة أخرى.', 'Could not reach the server. Try again.');
  if (error.code === 'INVALID_CURRENT_PASSWORD') return t('كلمة المرور الحالية غير صحيحة.', 'Current password is incorrect.');
  if (error.code === 'PASSWORD_REUSE') return t('اختر كلمة مرور جديدة مختلفة عن الحالية.', 'Choose a new password different from the current one.');
  if (error.code === 'VALIDATION_ERROR') return t('كلمة المرور الجديدة لا تطابق سياسة الأمان.', 'The new password does not meet the password policy.');
  if (error.status === 401) return t('انتهت الجلسة. سجل الدخول مرة أخرى.', 'Your session expired. Please log in again.');
  return error.message || t('حدث خطأ غير متوقع.', 'Something went wrong.');
}

export function ChangePasswordPage() {
  const { t } = useLanguage();
  usePageMeta(t('تغيير كلمة المرور', 'Change Password'));
  const auth = useAuth();
  const navigate = useNavigate();
  const form = useId();
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const field = (name: string) => `${form}-${name}`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setFormError('');
    const nextErrors: FormErrors = {};
    if (values.newPassword !== values.confirmPassword) nextErrors.confirmPassword = t('كلمتا المرور غير متطابقتين.', 'Passwords do not match.');
    const parsed = customerPasswordPatch.safeParse({ currentPassword: values.currentPassword, newPassword: values.newPassword });
    if (!parsed.success) for (const issue of parsed.error.issues) nextErrors[String(issue.path[0])] = issue.message;
    if (Object.keys(nextErrors).length || !parsed.success) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await auth.changePassword(parsed.data);
      sessionStorage.setItem('labna.passwordChanged', '1');
      navigate('/login?passwordChanged=1', { replace: true });
    } catch (error) {
      setFormError(serverMessage(error, t));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="auth-page" aria-labelledby="change-password-title">
      <div className="auth-card">
        <p>
          <Link to="/account">{t('العودة إلى الحساب', 'Back to account')}</Link>
        </p>
        <p className="eyebrow">{t('الأمان', 'Security')}</p>
        <h1 id="change-password-title">{t('تغيير كلمة المرور', 'Change Password')}</h1>
        <p className="hint">{t('بعد الحفظ ستحتاج إلى تسجيل الدخول مرة أخرى بكلمة المرور الجديدة.', 'After saving, you will need to sign in again with the new password.')}</p>
        {formError ? (
          <p className="form-alert" role="alert">
            {formError}
          </p>
        ) : null}
        <form className="auth-form" onSubmit={submit} noValidate>
          {[
            ['currentPassword', t('كلمة المرور الحالية', 'Current Password'), 'current-password'],
            ['newPassword', t('كلمة المرور الجديدة', 'New Password'), 'new-password'],
            ['confirmPassword', t('تأكيد كلمة المرور الجديدة', 'Confirm New Password'), 'new-password'],
          ].map(([name, label, autoComplete]) => (
            <div className="auth-field password-field" key={name}>
              <label htmlFor={field(name)}>{label}</label>
              <div className="password-input">
                <input
                  id={field(name)}
                  type={visible[name] ? 'text' : 'password'}
                  autoComplete={autoComplete}
                  value={values[name as keyof typeof values]}
                  aria-invalid={Boolean(errors[name])}
                  aria-describedby={errors[name] ? field(`${name}-error`) : undefined}
                  onChange={(event) => setValues({ ...values, [name]: event.target.value })}
                />
                <button type="button" className="password-toggle" onClick={() => setVisible({ ...visible, [name]: !visible[name] })}>
                  {visible[name] ? t('إخفاء', 'Hide') : t('إظهار', 'Show')}
                </button>
              </div>
              {errors[name] ? (
                <span id={field(`${name}-error`)} className="field-error">
                  {errors[name]}
                </span>
              ) : null}
            </div>
          ))}
          <button className="button button--wide" type="submit" disabled={saving}>
            {saving ? t('جارٍ التغيير...', 'Changing...') : t('تغيير كلمة المرور', 'Change Password')}
          </button>
        </form>
      </div>
    </section>
  );
}

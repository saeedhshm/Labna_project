import { useId, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { customerLoginBody, customerRegisterBody } from '@labna/contracts';
import { useAuth } from '../auth';
import { ApiError } from '../api';
import { useLanguage } from '../i18n';

type FormErrors = Record<string, string>;

function fieldID(form: string, name: string) {
  return `${form}-${name}`;
}

function fromLocation(state: unknown) {
  if (state && typeof state === 'object' && 'from' in state && typeof (state as { from?: unknown }).from === 'string') return (state as { from: string }).from;
  return '/account';
}

function serverMessage(error: unknown, t: (ar: string, en: string) => string) {
  if (!(error instanceof ApiError)) return t('تعذر الاتصال بالخادم. حاول مرة أخرى.', 'Could not reach the server. Try again.');
  if (error.code === 'DUPLICATE_RESOURCE') return t('يوجد حساب بهذا البريد الإلكتروني بالفعل.', 'An account with this email already exists.');
  if (error.code === 'INVALID_CREDENTIALS') return t('البريد الإلكتروني أو كلمة المرور غير صحيحة.', 'Email or password is incorrect.');
  if (error.code === 'VALIDATION_ERROR') return t('راجع الحقول وحاول مرة أخرى.', 'Check the fields and try again.');
  return error.message || t('حدث خطأ غير متوقع.', 'Something went wrong.');
}

export function LoginPage() {
  const { t } = useLanguage();
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const form = useId();
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  if (auth.status === 'authenticated') return <Navigate to={fromLocation(location.state)} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    const parsed = customerLoginBody.safeParse(values);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.message])));
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      await auth.login(parsed.data);
      navigate(fromLocation(location.state), { replace: true });
    } catch (error) {
      setFormError(serverMessage(error, t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-page" aria-labelledby="login-title">
      <div className="auth-card">
        <p className="eyebrow">{t('حسابك', 'Your account')}</p>
        <h1 id="login-title">{t('تسجيل الدخول', 'Login')}</h1>
        <p className="hint">{t('ادخل إلى حسابك لمتابعة الطلبات والعناوين لاحقًا.', 'Sign in to access customer-only pages.')}</p>
        {formError ? <p className="form-alert" role="alert">{formError}</p> : null}
        <form className="auth-form" onSubmit={submit} noValidate>
          <label htmlFor={fieldID(form, 'email')}>{t('البريد الإلكتروني', 'Email')}</label>
          <input id={fieldID(form, 'email')} type="email" autoComplete="email" value={values.email} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? fieldID(form, 'email-error') : undefined} onChange={event => setValues({ ...values, email: event.target.value })} />
          {errors.email ? <span id={fieldID(form, 'email-error')} className="field-error">{errors.email}</span> : null}

          <label htmlFor={fieldID(form, 'password')}>{t('كلمة المرور', 'Password')}</label>
          <input id={fieldID(form, 'password')} type="password" autoComplete="current-password" value={values.password} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? fieldID(form, 'password-error') : undefined} onChange={event => setValues({ ...values, password: event.target.value })} />
          {errors.password ? <span id={fieldID(form, 'password-error')} className="field-error">{errors.password}</span> : null}

          <button className="button button--wide" type="submit" disabled={loading}>{loading ? t('جارٍ الدخول...', 'Signing in...') : t('تسجيل الدخول', 'Login')}</button>
        </form>
        <p className="auth-switch">{t('ليس لديك حساب؟', 'No account?')} <Link to="/register" state={location.state}>{t('إنشاء حساب', 'Create account')}</Link></p>
      </div>
    </section>
  );
}

export function RegisterPage() {
  const { t } = useLanguage();
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const form = useId();
  const [values, setValues] = useState({ name: '', email: '', phoneNumber: '', password: '', passwordConfirmation: '' });
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  if (auth.status === 'authenticated') return <Navigate to={fromLocation(location.state)} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    const nextErrors: FormErrors = {};
    if (values.password !== values.passwordConfirmation) nextErrors.passwordConfirmation = t('كلمتا المرور غير متطابقتين.', 'Passwords do not match.');
    const parsed = customerRegisterBody.safeParse({ name: values.name, email: values.email, phoneNumber: values.phoneNumber, password: values.password });
    if (!parsed.success) for (const issue of parsed.error.issues) nextErrors[String(issue.path[0])] = issue.message;
    if (!values.email.trim()) nextErrors.email = t('البريد الإلكتروني مطلوب.', 'Email is required.');
    const body = parsed.success ? parsed.data : null;
    if (Object.keys(nextErrors).length || !body) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      await auth.register(body);
      navigate(fromLocation(location.state), { replace: true });
    } catch (error) {
      setFormError(serverMessage(error, t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-page" aria-labelledby="register-title">
      <div className="auth-card auth-card--wide">
        <p className="eyebrow">{t('حساب جديد', 'New account')}</p>
        <h1 id="register-title">{t('إنشاء حساب', 'Create account')}</h1>
        <p className="hint">{t('استخدم بياناتك الحقيقية حتى نربط الطلبات بحسابك.', 'Use your real details so orders can be linked to your account.')}</p>
        {formError ? <p className="form-alert" role="alert">{formError}</p> : null}
        <form className="auth-form" onSubmit={submit} noValidate>
          {[
            ['name', t('الاسم', 'Name'), 'text', 'name'],
            ['email', t('البريد الإلكتروني', 'Email'), 'email', 'email'],
            ['phoneNumber', t('رقم الهاتف', 'Phone number'), 'tel', 'tel'],
            ['password', t('كلمة المرور', 'Password'), 'password', 'new-password'],
            ['passwordConfirmation', t('تأكيد كلمة المرور', 'Confirm password'), 'password', 'new-password'],
          ].map(([name, label, type, autoComplete]) => (
            <div className="auth-field" key={name}>
              <label htmlFor={fieldID(form, name)}>{label}</label>
              <input id={fieldID(form, name)} type={type} autoComplete={autoComplete} value={values[name as keyof typeof values]} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? fieldID(form, `${name}-error`) : undefined} onChange={event => setValues({ ...values, [name]: event.target.value })} />
              {errors[name] ? <span id={fieldID(form, `${name}-error`)} className="field-error">{errors[name]}</span> : null}
            </div>
          ))}
          <button className="button button--wide" type="submit" disabled={loading}>{loading ? t('جارٍ إنشاء الحساب...', 'Creating account...') : t('إنشاء الحساب', 'Create account')}</button>
        </form>
        <p className="auth-switch">{t('لديك حساب بالفعل؟', 'Already have an account?')} <Link to="/login" state={location.state}>{t('تسجيل الدخول', 'Login')}</Link></p>
      </div>
    </section>
  );
}

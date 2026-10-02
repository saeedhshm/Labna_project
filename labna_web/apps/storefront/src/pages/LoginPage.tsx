import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api';
import { useCustomerSession } from '../customer-session';
import { useLanguage } from '../i18n';

export function LoginPage() {
  const session = useCustomerSession();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [form, setForm] = useState({ email: 'customer@example.com', password: 'password123' });
  const [error, setError] = useState<string>();
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try { await session.signIn(form); navigate('/account'); } catch (failure) { setError(failure instanceof ApiError ? failure.message : t('تعذر تسجيل الدخول.', 'Login failed.')); }
  }
  return <section className="auth-card"><h1>{t('تسجيل الدخول', 'Login')}</h1><form onSubmit={submit}><label>{t('البريد', 'Email')}<input type="email" dir="ltr" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></label><label>{t('كلمة المرور', 'Password')}<input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required /></label>{error ? <p className="stock-bad">{error}</p> : null}<button className="button button--wide" type="submit">{t('دخول', 'Login')}</button></form><p><Link to="/register">{t('إنشاء حساب جديد', 'Create an account')}</Link></p></section>;
}

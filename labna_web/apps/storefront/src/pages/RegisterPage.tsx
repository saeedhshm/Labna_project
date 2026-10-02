import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api';
import { useCustomerSession } from '../customer-session';
import { useLanguage } from '../i18n';

export function RegisterPage() {
  const session = useCustomerSession();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [form, setForm] = useState({ name: 'Demo Customer', phoneNumber: '+201012345678', email: 'customer@example.com', password: 'password123' });
  const [error, setError] = useState<string>();
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try { await session.register(form); navigate('/account'); } catch (failure) { setError(failure instanceof ApiError ? failure.message : t('تعذر إنشاء الحساب.', 'Registration failed.')); }
  }
  return <section className="auth-card"><h1>{t('إنشاء حساب', 'Register')}</h1><form onSubmit={submit}><label>{t('الاسم', 'Name')}<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></label><label>{t('الهاتف', 'Phone')}<input dir="ltr" value={form.phoneNumber} onChange={e => setForm({ ...form, phoneNumber: e.target.value })} required /></label><label>{t('البريد', 'Email')}<input type="email" dir="ltr" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></label><label>{t('كلمة المرور', 'Password')}<input type="password" minLength={8} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required /></label>{error ? <p className="stock-bad">{error}</p> : null}<button className="button button--wide" type="submit">{t('إنشاء الحساب', 'Register')}</button></form><p><Link to="/login">{t('لديك حساب؟ سجل الدخول', 'Already have an account? Login')}</Link></p></section>;
}

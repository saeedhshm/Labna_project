import { useState, type FormEvent } from 'react';
import { useSession } from '../session';
import { ApiError } from '../api/client';
import { Field, Notice } from '../components/Primitives';

export function LoginPage() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await signIn(email.trim(), password);
    } catch (failure) {
      setError(failure instanceof ApiError && failure.status === 401 ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' : 'تعذر تسجيل الدخول. حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login__card" onSubmit={submit}>
        <h1>لوحة تحكم لبنة</h1>
        <p className="login__hint">الدخول متاح للمدير فقط.</p>
        <Field label="البريد الإلكتروني" htmlFor="email">
          <input id="email" type="email" dir="ltr" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} />
        </Field>
        <Field label="كلمة المرور" htmlFor="password">
          <input id="password" type="password" dir="ltr" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />
        </Field>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'جارٍ الدخول…' : 'تسجيل الدخول'}
        </button>
      </form>
    </div>
  );
}

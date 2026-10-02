import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Notice } from './Primitives';

export function FormDialog({
  title,
  submitLabel,
  onClose,
  onSubmit,
  error,
  busy,
  children,
}: {
  title: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: () => void;
  error?: string;
  busy?: boolean;
  children: ReactNode;
}) {
  // Optimistic locking rejects a duplicate edit, but a create has no version to
  // compare, so a fast double submit would insert two records. The ref latches
  // synchronously, before React has re-rendered the disabled button.
  const submitting = useRef(false);
  useEffect(() => {
    if (!busy) submitting.current = false;
  }, [busy]);

  return (
    <div className="dialog__backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <header className="dialog__header">
          <h2>{title}</h2>
          <button type="button" className="ghost" onClick={onClose} aria-label="إغلاق">
            ✕
          </button>
        </header>
        <form
          onSubmit={event => {
            event.preventDefault();
            if (submitting.current) return;
            submitting.current = true;
            onSubmit();
          }}
        >
          <div className="dialog__body">{children}</div>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <footer className="dialog__footer">
            <button type="button" className="ghost" onClick={onClose}>
              إلغاء
            </button>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'جارٍ الحفظ…' : submitLabel}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm,
  error,
  busy,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  error?: string;
  busy?: boolean;
}) {
  return (
    <div className="dialog__backdrop" role="presentation">
      <div className="dialog dialog--narrow" role="alertdialog" aria-modal="true" aria-label={title}>
        <header className="dialog__header">
          <h2>{title}</h2>
        </header>
        <div className="dialog__body">
          <p>{message}</p>
          {error ? <Notice tone="error">{error}</Notice> : null}
        </div>
        <footer className="dialog__footer">
          <button type="button" className="ghost" onClick={onCancel}>
            تراجع
          </button>
          <button type="button" className="danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'جارٍ التنفيذ…' : confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Single-select language preview so staff can review how a text field will look. */
export function TextPreview({ ar: arText, en: enText }: { ar: string; en: string }) {
  const [language, setLanguage] = useState<'ar' | 'en'>('ar');
  return (
    <div className="preview">
      <button type="button" className={language === 'ar' ? 'chip chip--active' : 'chip'} onClick={() => setLanguage('ar')}>
        عربي
      </button>
      <button type="button" className={language === 'en' ? 'chip chip--active' : 'chip'} onClick={() => setLanguage('en')}>
        English
      </button>
      <p dir={language}>{language === 'ar' ? arText || '—' : enText || '—'}</p>
    </div>
  );
}

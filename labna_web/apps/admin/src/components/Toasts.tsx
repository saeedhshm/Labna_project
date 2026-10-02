import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

type Tone = 'success' | 'error';
type Toast = { id: number; tone: Tone; message: string };

type ToastApi = {
  toasts: Toast[];
  notify: (tone: Tone, message: string) => void;
  dismiss: (id: number) => void;
  timeout: number;
};

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Lightweight success/error feedback for admin screens.
 *
 * Reuses the existing `notice` palette and the `role="status"` / `role="alert"`
 * semantics already used across the panel, so this extends the current design
 * system instead of introducing a second one.
 */
export function ToastProvider({ children, timeout = 4000 }: { children: ReactNode; timeout?: number }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  const notify = useCallback((tone: Tone, message: string) => {
    const id = nextId.current++;
    setToasts(current => [...current, { id, tone, message }]);
  }, []);

  const api = useMemo<ToastApi>(() => ({ toasts, notify, dismiss, timeout }), [dismiss, notify, timeout, toasts]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastList toasts={toasts} onDismiss={dismiss} timeout={timeout} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}

function ToastList({ toasts, onDismiss, timeout }: { toasts: Toast[]; onDismiss: (id: number) => void; timeout: number }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} timeout={timeout} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss, timeout }: { toast: Toast; onDismiss: (id: number) => void; timeout: number }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), timeout);
    return () => clearTimeout(timer);
  }, [onDismiss, timeout, toast.id]);

  return (
    <div className={`toast toast--${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
      <span>{toast.message}</span>
      <button type="button" className="ghost" onClick={() => onDismiss(toast.id)} aria-label="إغلاق التنبيه">
        ✕
      </button>
    </div>
  );
}
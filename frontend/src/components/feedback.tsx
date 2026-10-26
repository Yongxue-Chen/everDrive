import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type ToastTone = 'success' | 'error' | 'info';
type Toast = { id: number; tone: ToastTone; title: string; detail?: string };

type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** When set, the user must type this exact text before confirming. */
  requireText?: string;
};

type FeedbackContextValue = {
  toast: (tone: ToastTone, title: string, detail?: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((item) => item.id !== id)), []);

  const toast = useCallback(
    (tone: ToastTone, title: string, detail?: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { id, tone, title, detail }]);
      window.setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 4500);
    },
    [dismiss]
  );

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })), []);

  const close = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
  };

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className={`toast toast--${item.tone}`}>
            {item.tone === 'success' ? <CheckCircle2 size={18} /> : item.tone === 'error' ? <XCircle size={18} /> : <Info size={18} />}
            <div className="toast__body">
              <strong>{item.title}</strong>
              {item.detail ? <span>{item.detail}</span> : null}
            </div>
            <button className="icon-button" aria-label="关闭提示" onClick={() => dismiss(item.id)}>
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
      {pending ? <ConfirmDialog options={pending} onClose={close} /> : null}
    </FeedbackContext.Provider>
  );
}

function ConfirmDialog({ options, onClose }: { options: ConfirmOptions; onClose: (value: boolean) => void }) {
  const [typed, setTyped] = useState('');
  const blocked = Boolean(options.requireText) && typed.trim() !== options.requireText;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => onClose(false)}>
      <div className="modal modal--confirm" role="alertdialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className={`confirm__icon ${options.danger ? 'confirm__icon--danger' : ''}`}>
          <AlertTriangle size={22} />
        </div>
        <h3>{options.title}</h3>
        {options.description ? <div className="confirm__desc">{options.description}</div> : null}
        {options.requireText ? (
          <label className="field">
            <span>
              请输入 <b className="mono">{options.requireText}</b> 以确认
            </span>
            <input autoFocus value={typed} onChange={(event) => setTyped(event.target.value)} />
          </label>
        ) : null}
        <div className="modal__actions">
          <button onClick={() => onClose(false)}>取消</button>
          <button
            autoFocus={!options.requireText}
            className={options.danger ? 'button-danger' : 'button-primary'}
            disabled={blocked}
            onClick={() => onClose(true)}
          >
            {options.confirmLabel ?? '确认'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useFeedback(): FeedbackContextValue {
  const value = useContext(FeedbackContext);
  if (!value) {
    throw new Error('useFeedback must be used inside FeedbackProvider');
  }
  return value;
}

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './ConfirmDialog.css';

interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface PendingConfirm {
  message: string;
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback<ConfirmFn>((message, options = {}) => {
    return new Promise<boolean>((resolve) => {
      setPending({ message, options, resolve });
    });
  }, []);

  const close = (result: boolean) => {
    pending?.resolve(result);
    setPending(null);
  };

  const dialog =
    pending &&
    createPortal(
      <div className="confirm-backdrop" onClick={() => close(false)} role="presentation">
        <div
          className="confirm-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-message"
          onClick={(event) => event.stopPropagation()}
        >
          {pending.options.title ? (
            <h2 className="confirm-dialog-title">{pending.options.title}</h2>
          ) : null}
          <p id="confirm-dialog-message" className="confirm-dialog-message">
            {pending.message}
          </p>
          <div className="confirm-dialog-actions">
            <button type="button" className="btn confirm-dialog-cancel" onClick={() => close(false)}>
              {pending.options.cancelLabel ?? '취소'}
            </button>
            <button type="button" className="btn btn-primary confirm-dialog-confirm" onClick={() => close(true)}>
              {pending.options.confirmLabel ?? '삭제'}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return confirm;
}

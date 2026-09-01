import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import './AppDialog.css';

const DialogContext = createContext(null);
let externalOpenDialog = null;

function requestDialog(options) {
  if (!externalOpenDialog) {
    console.error('Application dialog provider is unavailable.', options);
    return Promise.resolve(options.kind === 'confirm' ? false : true);
  }
  return externalOpenDialog(options);
}

export function showAppAlert(message, options = {}) {
  return requestDialog({ kind: 'alert', message: String(message || ''), ...options });
}

export function showAppConfirm(message, options = {}) {
  return requestDialog({ kind: 'confirm', message: String(message || ''), ...options });
}

export function useAppDialog() {
  return useContext(DialogContext);
}

export function AppDialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const queueRef = useRef([]);
  const actionRef = useRef(null);

  const showNext = useCallback(() => {
    const next = queueRef.current.shift() || null;
    setDialog(next);
  }, []);

  const openDialog = useCallback((options) => new Promise((resolve) => {
    queueRef.current.push({
      title: options.title || (options.kind === 'confirm' ? 'Please Confirm' : options.tone === 'error' ? 'Action Unsuccessful' : 'Notification'),
      confirmLabel: options.confirmLabel || (options.kind === 'confirm' ? 'Confirm' : 'OK'),
      cancelLabel: options.cancelLabel || 'Cancel',
      tone: options.tone || 'info',
      ...options,
      resolve,
    });
    setDialog((current) => current || queueRef.current.shift());
  }), []);

  useEffect(() => {
    externalOpenDialog = openDialog;
    return () => {
      if (externalOpenDialog === openDialog) externalOpenDialog = null;
    };
  }, [openDialog]);

  useEffect(() => {
    if (dialog) window.setTimeout(() => actionRef.current?.focus(), 0);
  }, [dialog]);

  const close = useCallback((result) => {
    if (!dialog) return;
    dialog.resolve(result);
    setDialog(null);
    window.setTimeout(showNext, 0);
  }, [dialog, showNext]);

  useEffect(() => {
    if (!dialog) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') close(dialog.kind === 'confirm' ? false : true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialog, close]);

  return <DialogContext.Provider value={{ alert: showAppAlert, confirm: showAppConfirm }}>
    {children}
    {dialog && <div className="app-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) close(dialog.kind === 'confirm' ? false : true);
    }}>
      <section className={`app-dialog app-dialog-${dialog.tone}`} role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" aria-describedby="app-dialog-message">
        <div className="app-dialog-accent" />
        <div className="app-dialog-body">
          <div className="app-dialog-icon" aria-hidden="true">{dialog.tone === 'error' ? '!' : dialog.tone === 'success' ? '✓' : dialog.kind === 'confirm' ? '?' : 'i'}</div>
          <div>
            <h2 id="app-dialog-title">{dialog.title}</h2>
            <p id="app-dialog-message">{dialog.message}</p>
          </div>
        </div>
        <div className="app-dialog-actions">
          {dialog.kind === 'confirm' && <button type="button" className="app-dialog-cancel" onClick={() => close(false)}>{dialog.cancelLabel}</button>}
          <button ref={actionRef} type="button" className={`app-dialog-confirm${dialog.danger ? ' danger' : ''}`} onClick={() => close(true)}>{dialog.confirmLabel}</button>
        </div>
      </section>
    </div>}
  </DialogContext.Provider>;
}

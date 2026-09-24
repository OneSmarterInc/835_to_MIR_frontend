import React, { useEffect, useState } from 'react';
import CenteredModal from './CenteredModal';

export default function RevokeClientModal({ isOpen, onClose, client, onConfirm, loading }) {
  const [step, setStep] = useState(1);
  const [confirmationName, setConfirmationName] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setConfirmationName('');
      setPassword('');
    }
  }, [isOpen, client?.id]);

  if (!client) return null;

  const nameMatches = confirmationName === client.name;

  const close = () => {
    if (!loading) onClose();
  };

  const submitPassword = (event) => {
    event.preventDefault();
    if (password && !loading) onConfirm({ confirmationName, password });
  };

  return (
    <CenteredModal isOpen={isOpen} onClose={close}>
      <div className="modal-t" style={{ color: 'var(--brick)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>⚠️</span> Permanently Delete Client
      </div>
      <div className="modal-b" style={{ marginTop: '12px', fontSize: '13.5px', color: 'var(--ink)' }}>
        This will permanently delete <b>"{client.name}"</b> and all client users, files, conversions, mappings, schedules, configuration, and related records.
      </div>
      {step === 1 ? (
        <form onSubmit={(event) => { event.preventDefault(); if (nameMatches) setStep(2); }}>
          <label htmlFor="delete-client-name" style={{ display: 'block', fontSize: '12px', fontWeight: 600, margin: '18px 0 7px' }}>
            Enter the exact client name to continue
          </label>
          <input
            id="delete-client-name"
            value={confirmationName}
            onChange={(event) => setConfirmationName(event.target.value)}
            placeholder={client.name}
            autoComplete="off"
            autoFocus
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
            <button type="button" className="btn" onClick={close}>Cancel</button>
            <button type="submit" className="btn danger" disabled={!nameMatches}>Continue</button>
          </div>
        </form>
      ) : (
        <form onSubmit={submitPassword}>
          <label htmlFor="delete-client-password" style={{ display: 'block', fontSize: '12px', fontWeight: 600, margin: '18px 0 7px' }}>
            Confirm your super administrator password
          </label>
          <input
            id="delete-client-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            autoFocus
            style={{ width: '100%' }}
          />
          <p style={{ fontSize: '12px', color: 'var(--brick)', lineHeight: 1.5, margin: '9px 0 0' }}>
            This operation cannot be undone.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
            <button type="button" className="btn" onClick={() => setStep(1)} disabled={loading}>Back</button>
            <button
              type="submit"
              className="btn danger"
              id="btn-confirm-revoke"
              disabled={!password || loading}
              style={{ background: 'var(--brick-bg)', borderColor: 'var(--brick)', color: 'var(--brick)', fontWeight: 600 }}
            >
              {loading ? 'Deleting…' : 'Delete Client Permanently'}
            </button>
          </div>
        </form>
      )}
    </CenteredModal>
  );
}

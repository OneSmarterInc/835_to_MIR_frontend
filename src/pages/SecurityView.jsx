import React, { useState, useEffect } from 'react';
import { safeFetchJson } from '../utils/api';
import { startRegistration } from '@simplewebauthn/browser';
import WorkspaceHeader from '../components/WorkspaceHeader';

export default function SecurityView() {
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [keyName, setKeyName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [keyToRemove, setKeyToRemove] = useState(null);

  const fetchCredentials = async () => {
    try {
      const { res, data } = await safeFetchJson('/accounts/api/webauthn/credentials/', { credentials: 'include' });
      if (res.ok) {
        setCredentials(data);
      } else {
        setError('Failed to fetch security keys');
      }
    } catch (err) {
      setError('Failed to fetch security keys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCredentials();
  }, []);

  const handleAddSecurityKey = async () => {
    if (!keyName.trim()) {
      setError("Please provide a name for your security key.");
      return;
    }
    setError('');
    setSuccess('');
    setIsAdding(true);
    try {
      const { res: optionsRes, data: options } = await safeFetchJson('/accounts/api/webauthn/register/options/', {
        method: 'POST',
        credentials: 'include'
      });

      if (!optionsRes.ok) throw new Error(options.error || 'Failed to get options');

      let attestation;
      try {
        attestation = await startRegistration({ optionsJSON: options });
      } catch (err) {
        if (err.name === 'InvalidStateError') {
          setError('This key has already been registered to another account in the system. Please try using a different key.');
        } else if (err.name === 'NotAllowedError') {
          setError(''); // Clear error if user voluntarily cancelled
        } else {
          setError(err.message);
        }
        setIsAdding(false);
        return;
      }

      const { res: verifyRes, data: verifyData } = await safeFetchJson('/accounts/api/webauthn/register/verify/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...attestation, name: keyName })
      });
      
      if (!verifyRes.ok) throw new Error(verifyData.error || 'Registration failed');

      setSuccess('Security key registered successfully!');
      setKeyName('');
      fetchCredentials();
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveKey = (key) => {
    setKeyToRemove(key);
  };

  const confirmRemoveKey = async () => {
    if (!keyToRemove) return;
    try {
      await safeFetchJson(`/accounts/api/webauthn/credentials/${keyToRemove.id}/`, {
        method: 'DELETE',
        credentials: 'include'
      });
      fetchCredentials();
      setSuccess('Security key removed successfully.');
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError('Failed to remove security key');
    } finally {
      setKeyToRemove(null);
    }
  };

  if (loading) return <div style={{ padding: "40px", textAlign: "center", color: "var(--ink-3)" }}>Loading security settings...</div>;

  return (
    <section className="view on table-screen" id="v-security">
      <WorkspaceHeader 
        eyebrow="Security workspace" 
        title="Security Keys" 
        description="Manage your hardware keys and passkeys for passwordless authentication." 
      />

      {error && (
        <div className="note" style={{ background: 'var(--brick-bg)', borderColor: 'var(--brick)', color: 'var(--brick)', marginBottom: "16px" }}>
          <b>Error:</b> {error}
        </div>
      )}
      
      {success && (
        <div className="note" style={{ background: '#f0f9ff', borderColor: '#0284c7', color: '#0284c7', marginBottom: "16px" }}>
          <b>Success:</b> {success}
        </div>
      )}

      <h2 className="sec">Hardware Keys & Passkeys</h2>
      
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="datatable" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th>NAME</th>
              <th>ADDED</th>
              <th>LAST USED</th>
              <th style={{ textAlign: "right" }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {credentials.length === 0 ? (
              <tr>
                <td colSpan="4" style={{ padding: "32px", textAlign: "center", color: "var(--ink-3)", fontStyle: "italic" }}>
                  No security keys registered yet. Add one below.
                </td>
              </tr>
            ) : (
              credentials.map((cred) => (
                <tr key={cred.id}>
                  <td style={{ fontWeight: 600 }}>{cred.name}</td>
                  <td>{new Date(cred.created_at).toLocaleDateString()}</td>
                  <td>{new Date(cred.last_used).toLocaleDateString()}</td>
                  <td style={{ textAlign: "right" }}>
                    <button 
                      onClick={() => handleRemoveKey(cred)}
                      style={{ background: "transparent", color: "var(--brick)", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: "600", textDecoration: "none" }}
                      onMouseOver={e => e.currentTarget.style.textDecoration = "underline"}
                      onMouseOut={e => e.currentTarget.style.textDecoration = "none"}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        
        <div style={{ padding: "16px", borderTop: "1px solid var(--line)", background: "var(--surface)" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <input 
              type="text" 
              value={keyName} 
              onChange={e => setKeyName(e.target.value)} 
              placeholder="Name (e.g. Office YubiKey)"
              className="control"
              style={{ width: "320px", height: "38px", boxSizing: "border-box", padding: "7px" }}
              disabled={credentials.length >= 5}
            />
            <button 
              onClick={handleAddSecurityKey}
              disabled={isAdding || credentials.length >= 5}
              className="btn primary"
              style={{ height: "38px", boxSizing: "border-box", display: "flex", alignItems: "center", padding: "0 20px" }}
            >
              {isAdding ? 'Waiting for key...' : 'Register New Key'}
            </button>
          </div>
          {credentials.length >= 5 && <div style={{ fontSize: "12px", color: "var(--ink-3)", marginTop: "6px" }}>You have reached the maximum limit of 5 security keys.</div>}
        </div>
      </div>

      {keyToRemove && (
        <div className="modal on" onClick={() => setKeyToRemove(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-t" style={{ color: 'var(--brick)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              Remove Security Key
            </div>
            
            <div className="modal-b" style={{ marginTop: '14px', fontSize: '13.5px', color: 'var(--ink)' }}>
              <p>
                Are you sure you want to remove the key <strong style={{ color: 'var(--ink)' }}>{keyToRemove.name}</strong>?
              </p>
              <p style={{ marginTop: '10px' }}>
                You won't be able to sign in with this key anymore.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button type="button" className="btn" onClick={() => setKeyToRemove(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={confirmRemoveKey}
                style={{ background: 'var(--brick)', color: '#fff', border: 'none' }}
              >
                Yes, remove key
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

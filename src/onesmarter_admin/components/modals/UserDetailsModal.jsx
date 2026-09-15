import React, { useEffect, useState } from 'react';
import CenteredModal from './CenteredModal';
import TimeDisplay from '../../../components/TimeDisplay';

export default function UserDetailsModal({ isOpen, onClose, user, availableScreens = [], canManageScreens = false, onSaveScreens, clients = [], activeGrants = [], onGrantClientAccess, onRevokeClientAccess }) {
  const [screens, setScreens] = useState([]);
  const [saving, setSaving] = useState(false);
  const [grantClientId, setGrantClientId] = useState('');
  const [grantReason, setGrantReason] = useState('');
  const [durationValue, setDurationValue] = useState(30);
  const [durationUnit, setDurationUnit] = useState('minutes');
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState('');
  const [revokingGrantId, setRevokingGrantId] = useState(null);
  const [revokeError, setRevokeError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [security, setSecurity] = useState(null);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityError, setSecurityError] = useState('');
  const [unblocking, setUnblocking] = useState(false);

  useEffect(() => {
    setScreens(user?.admin_screens || []);
  }, [user, isOpen]);

  useEffect(() => {
    if (!isOpen || !user?.id) {
      setSecurity(null);
      setSecurityError('');
      return undefined;
    }
    let alive = true;
    setSecurityLoading(true);
    setSecurityError('');
    fetch(`/accounts/api/admin/users/${encodeURIComponent(user.id)}/security/`, {
      credentials: 'include',
      headers: { 'X-Admin-Screen': 'access' },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data.error || 'Unable to load account security state.');
        if (alive) setSecurity(data.security || null);
      })
      .catch((error) => { if (alive) setSecurityError(error.message || 'Unable to load account security state.'); })
      .finally(() => { if (alive) setSecurityLoading(false); });
    return () => { alive = false; };
  }, [isOpen, user?.id]);

  useEffect(() => {
    if (!isOpen || activeGrants.length === 0) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, activeGrants.length]);

  const formatRemaining = (expiresAt) => {
    const seconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (days) return `${days}d ${hours}h ${minutes}m ${secs}s`;
    if (hours) return `${hours}h ${minutes}m ${secs}s`;
    return `${minutes}m ${secs}s`;
  };

  if (!user) return null;

  const isAdministrator = user.role === 'Admin' || user.role === 'Super Admin';
  const editable = canManageScreens && user.role === 'Admin';
  const currentGrants = activeGrants.filter((grant) => new Date(grant.expires_at).getTime() > now);
  const toggleScreen = (key) => setScreens((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);

  const unblockUser = async () => {
    if (!user?.id || unblocking) return;
    setUnblocking(true);
    setSecurityError('');
    try {
      const res = await fetch(`/accounts/api/admin/users/${encodeURIComponent(user.id)}/security/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Screen': 'access' },
        body: JSON.stringify({ action: 'unblock' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Unable to unblock this account.');
      setSecurity(data.security || { blocked: false, failed_login_attempts: 0 });
    } catch (error) {
      setSecurityError(error.message || 'Unable to unblock this account.');
    } finally {
      setUnblocking(false);
    }
  };

  return (
    <CenteredModal isOpen={isOpen} onClose={onClose}>
      <div className="modal-t" style={{ fontSize: '20px', marginBottom: '8px' }}>User Account Profile</div>
      <p className="modal-b" style={{ marginBottom: '20px' }}>Full profile details for the selected user account.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '10px 0 20px' }}>
        <div style={{ borderBottom: '1px solid var(--line-soft)', paddingBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }}>Full Name</span>
          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink)' }}>{user.name || user.person || '—'}</span>
        </div>

        <div style={{ borderBottom: '1px solid var(--line-soft)', paddingBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }}>Email Address</span>
          <span style={{ fontSize: '14px', color: 'var(--ink)', fontFamily: 'monospace' }}>{user.email || '—'}</span>
        </div>

        <div style={{ borderBottom: '1px solid var(--line-soft)', paddingBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }}>Mobile Phone</span>
          <span style={{ fontSize: '14px', color: 'var(--ink)' }}>{user.mobile || '—'}</span>
        </div>

        <div style={{ borderBottom: '1px solid var(--line-soft)', paddingBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }}>System Role</span>
          <span className={`tag ${user.role === 'Admin' ? 'ok' : 'idle'}`} style={{ display: 'inline-block', fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '3px' }}>
            {user.role}
          </span>
        </div>

        <div style={{ borderBottom: '1px solid var(--line-soft)', paddingBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }}>Associated Client</span>
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--ink)' }}>
            {user.role === 'Admin' ? 'OneSmarter' : (user.client_name || user.clients?.join(', ') || 'None')}
          </span>
        </div>

        <div style={{ borderBottom: '1px solid var(--line-soft)', paddingBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }}>MFA Status</span>
          <span style={{ fontSize: '13px', color: 'var(--ink)' }}>{user.mfa || (user.totp_enabled ? '2FA Enabled' : 'Password Only')}</span>
        </div>

        <div style={{ borderBottom: '1px solid var(--line-soft)', paddingBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }}>Last System Login (EST)</span>
          <TimeDisplay value={user.last_login || user.created_at} easternOnly />
        </div>

        <div>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }}>Account Status</span>
          {securityLoading ? (
            <span style={{ fontSize: '12px', color: 'var(--ink-3)' }}>Checking…</span>
          ) : security?.blocked ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
              <span className="tag err" style={{ fontSize: '11px', fontWeight: 700 }}>Blocked</span>
              <span style={{ fontSize: '12px', color: 'var(--ink-2)' }}>{security.reason || 'Blocked after repeated unsuccessful password attempts.'}</span>
              {security.blocked_at && <span style={{ fontSize: '12px', color: 'var(--ink-3)' }}>Blocked: <TimeDisplay value={security.blocked_at} easternOnly /></span>}
              <span style={{ fontSize: '12px', color: 'var(--ink-3)' }}>Failed password attempts: {security.failed_login_attempts || 0}</span>
              <button type="button" className="btn primary" disabled={unblocking} onClick={unblockUser}>{unblocking ? 'Unblocking…' : 'Unblock User'}</button>
            </div>
          ) : (
            <span className="tag ok" style={{ fontSize: '11px', fontWeight: 700 }}>Active</span>
          )}
          {securityError && <div className="admin-client-grant-hint" style={{ marginTop: '8px' }}>{securityError}</div>}
        </div>
      </div>

      {isAdministrator && (
        <div className="admin-screen-access">
          <div className="admin-screen-access-heading">
            <strong>Admin Screen Access</strong>
            <span>{user.role === 'Super Admin' ? 'All screens are always available.' : 'Only selected screens appear in this administrator’s menu.'}</span>
          </div>
          <div className="admin-screen-access-grid">
            {availableScreens.map((screen) => (
              <label key={screen.key}>
                <input
                  type="checkbox"
                  checked={user.role === 'Super Admin' || screens.includes(screen.key)}
                  disabled={!editable}
                  onChange={() => toggleScreen(screen.key)}
                />
                <span>{screen.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {canManageScreens && user.role === 'Admin' && (
        <div className="admin-screen-access">
          <div className="admin-screen-access-heading"><strong>Temporary Client Data Access</strong><span>Access expires automatically at the selected duration.</span></div>
          <div className="admin-client-grant-form">
            <select value={grantClientId} onChange={(event) => setGrantClientId(event.target.value)}>
              <option value="">Select client</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
            <input value={grantReason} onChange={(event) => setGrantReason(event.target.value)} placeholder="Business reason (minimum 10 characters)" />
            <input type="number" min="1" step="1" value={durationValue} aria-label="Access duration" onChange={(event) => setDurationValue(event.target.value)} />
            <select value={durationUnit} aria-label="Access duration unit" onChange={(event) => setDurationUnit(event.target.value)}>
              <option value="minutes">Minutes</option>
              <option value="days">Days</option>
              <option value="weeks">Weeks</option>
              <option value="months">Months</option>
            </select>
            <button type="button" className="btn primary" disabled={granting || !grantClientId || grantReason.trim().length < 10 || Number(durationValue) < 1} onClick={async () => {
              setGranting(true);
              setGrantError('');
              try {
                await onGrantClientAccess(user, { client_id: grantClientId, reason: grantReason.trim(), duration_value: Number(durationValue), duration_unit: durationUnit });
                setGrantReason('');
              } catch (error) {
                setGrantError(error.message || 'Unable to grant client access.');
              } finally {
                setGranting(false);
              }
            }}>{granting ? 'Granting…' : 'Grant Access'}</button>
          </div>
          {grantReason.length > 0 && grantReason.trim().length < 10 && <div className="admin-client-grant-hint">Enter at least 10 characters to enable Grant Access.</div>}
          {grantError && <div className="admin-client-grant-hint">{grantError}</div>}
          {currentGrants.length > 0 && (
            <div className="admin-active-grants">
              <strong>Granted Client Access</strong>
              {currentGrants.map((grant) => <div className="admin-active-grant" key={grant.id}><span><b>{grant.client_name}</b><small>Time remaining: <strong>{formatRemaining(grant.expires_at)}</strong></small><small>Expires: {new Date(grant.expires_at).toLocaleString()}</small></span><button type="button" className="btn" disabled={revokingGrantId === grant.id} onClick={async () => {
                setRevokeError('');
                setRevokingGrantId(grant.id);
                try {
                  await onRevokeClientAccess(grant, user);
                } catch (error) {
                  setRevokeError(error.message || 'Unable to revoke client access.');
                } finally {
                  setRevokingGrantId(null);
                }
              }}>{revokingGrantId === grant.id ? 'Revoking…' : 'Revoke Access'}</button></div>)}
              {revokeError && <div className="admin-client-grant-hint">{revokeError}</div>}
            </div>
          )}
        </div>
      )}

      <div className="modal-actions" style={{ marginTop: '20px' }}>
        <button type="button" className="btn" onClick={onClose}>Close</button>
        {editable && <button type="button" className="btn primary" disabled={saving} onClick={async () => { setSaving(true); try { await onSaveScreens(user, screens); } finally { setSaving(false); } }}>{saving ? 'Saving…' : 'Save Access'}</button>}
      </div>
    </CenteredModal>
  );
}

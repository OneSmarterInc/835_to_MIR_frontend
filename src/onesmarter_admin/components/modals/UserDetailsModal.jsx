import React, { useEffect, useState } from 'react';
import CenteredModal from './CenteredModal';
import TimeDisplay from '../../../components/TimeDisplay';

export default function UserDetailsModal({ isOpen, onClose, user, availableScreens = [], canManageScreens = false, onSaveScreens, clients = [], activeGrants = [], onGrantClientAccess, onRevokeClientAccess }) {
  const [screens, setScreens] = useState([]);
  const [saving, setSaving] = useState(false);
  const [grantClientId, setGrantClientId] = useState('');
  const [grantReason, setGrantReason] = useState('');

  useEffect(() => {
    setScreens(user?.admin_screens || []);
  }, [user, isOpen]);

  if (!user) return null;

  const isAdministrator = user.role === 'Admin' || user.role === 'Super Admin';
  const editable = canManageScreens && user.role === 'Admin';
  const toggleScreen = (key) => setScreens((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);

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
          <span className="tag ok" style={{ fontSize: '11px', fontWeight: 700 }}>Active</span>
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

      {canManageScreens && isAdministrator && (
        <div className="admin-screen-access">
          <div className="admin-screen-access-heading"><strong>Temporary Client Data Access</strong><span>Expires automatically after 30 minutes.</span></div>
          <div className="admin-client-grant-form">
            <select value={grantClientId} onChange={(event) => setGrantClientId(event.target.value)}>
              <option value="">Select client</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
            <input value={grantReason} onChange={(event) => setGrantReason(event.target.value)} placeholder="Business reason for protected-data access" />
            <button type="button" className="btn" disabled={!grantClientId || grantReason.trim().length < 10} onClick={async () => { await onGrantClientAccess(user, { client_id: grantClientId, reason: grantReason.trim(), duration_minutes: 30 }); setGrantReason(''); }}>Grant 30 min</button>
          </div>
          {activeGrants.map((grant) => <div className="admin-active-grant" key={grant.id}><span><b>{grant.client_name}</b> · until {new Date(grant.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><button type="button" className="btn" onClick={() => onRevokeClientAccess(grant.id)}>Revoke</button></div>)}
        </div>
      )}

      <div className="modal-actions" style={{ marginTop: '20px' }}>
        <button type="button" className="btn" onClick={onClose}>Close</button>
        {editable && <button type="button" className="btn primary" disabled={saving} onClick={async () => { setSaving(true); try { await onSaveScreens(user, screens); } finally { setSaving(false); } }}>{saving ? 'Saving…' : 'Save Access'}</button>}
      </div>
    </CenteredModal>
  );
}

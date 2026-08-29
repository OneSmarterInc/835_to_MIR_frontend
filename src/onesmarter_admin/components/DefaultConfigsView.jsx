import React, { useState, useEffect } from 'react';
import SftpBrowserModal from '../../components/SftpBrowserModal';

function getAuthHeaders(extra = {}) {
  const token = localStorage.getItem('onesmarter_admin_token');
  const headers = { ...extra };
  if (token) headers['Authorization'] = `Token ${token}`;
  return headers;
}

async function readJsonResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Server returned a non-JSON response (${response.status}).`);
  }
  return response.json();
}

export default function DefaultConfigsView() {
  
  const [sftpHost, setSftpHost] = useState('');
  const [sftpPort, setSftpPort] = useState('22');
  const [sftpUser, setSftpUser] = useState('');
  const [sftpPass, setSftpPass] = useState('');
  const [sftpInbound835, setSftpInbound835] = useState('');
  const [sftpInbound837, setSftpInbound837] = useState('');
  const [sftpOutboundMir, setSftpOutboundMir] = useState('');
  const [sftpStatus, setSftpStatus] = useState('');
  const [sftpLoading, setSftpLoading] = useState(false);
  const [sftpConnected, setSftpConnected] = useState(false);
  const [showSftpPass, setShowSftpPass] = useState(false);
  const [sftpHasPassword, setSftpHasPassword] = useState(false);
  const [sftpConfigId, setSftpConfigId] = useState(null);
  const [browserState, setBrowserState] = useState(null);

  const [smtpSenderName, setSmtpSenderName] = useState('');
  const [smtpSenderEmail, setSmtpSenderEmail] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpSecurity, setSmtpSecurity] = useState('STARTTLS');
  const [smtpReplyTo, setSmtpReplyTo] = useState('');
  const [smtpStatus, setSmtpStatus] = useState('');
  const [smtpLoading, setSmtpLoading] = useState(false);
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [smtpHasPassword, setSmtpHasPassword] = useState(false);

  useEffect(() => {
    fetch('/edi835/api/sftp/get/', { headers: getAuthHeaders() })
      .then(async res => {
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.error || data.detail || `Request failed (${res.status}).`);
        return data;
      })
      .then(data => {
        if (data && data.success && data.configs) {
          const cfg = data.configs.find(c => !c.client_id && !c.client);
          if (cfg) {
            setSftpConfigId(cfg.id ?? cfg.config_id ?? null);
            setSftpHost(cfg.host || '');
            setSftpPort(String(cfg.port || '22'));
            setSftpUser(cfg.username || '');
            // Saved secrets are never returned by the API.
            setSftpPass('');
            setSftpHasPassword(Boolean(cfg.has_password));
            setSftpInbound835(cfg.inbound_835_folder || '');
            setSftpInbound837(cfg.inbound_837_folder || '');
            setSftpOutboundMir(cfg.outbound_mir_folder || '');
            setSftpConnected(cfg.status === 'CONNECTED');
            setSftpStatus(`Loaded — Status: ${cfg.status || 'PENDING'}`);
          }
        }
      })
      .catch(err => console.error('Failed to load default SFTP', err));

    fetch('/admin-panel/api/default-smtp/', { headers: getAuthHeaders() })
      .then(async res => {
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.error || data.detail || `Request failed (${res.status}).`);
        return data;
      })
      .then(data => {
        if (data && data.success && data.config) {
          const cfg = data.config;
          setSmtpSenderName(cfg.sender_name || '');
          setSmtpSenderEmail(cfg.sender_email || '');
          setSmtpHost(cfg.smtp_host || '');
          setSmtpPort(String(cfg.smtp_port || '587'));
          setSmtpUser(cfg.smtp_username || '');
          setSmtpPass('');
          setSmtpHasPassword(Boolean(cfg.has_password));
          setSmtpSecurity(cfg.security || 'STARTTLS');
          setSmtpReplyTo(cfg.reply_to || '');
          setSmtpStatus('Loaded SMTP configuration from database.');
        }
      })
      .catch(err => console.error('Failed to load default SMTP', err));
  }, []);

  const openBrowser = (currentVal, setter) => {
    const configId = String(sftpConfigId ?? '').trim();
    if (!configId) {
      setSftpStatus('Please save the SFTP configuration before browsing folders.');
      return;
    }
    setBrowserState({
      configId,
      initialPath: currentVal?.trim() || '.',
      onSelectFolder: (p) => { setter(p); setBrowserState(null); },
    });
  };

  const FolderBrowse = ({ label, value, onChange, setter }) => (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder="/path/to/folder" style={{ flex: 1 }} />
        <button
          type="button"
          title="Browse Remote SFTP Folder"
          onClick={() => openBrowser(value, setter)}
          style={{ padding: '7px 10px', background: 'var(--surface,#f8fafc)', border: '1px solid var(--teal,#0d9488)', borderRadius: '4px', cursor: 'pointer', color: 'var(--teal,#0d9488)', display: 'flex', alignItems: 'center', flexShrink: 0 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </div>
    </div>
  );

  const EyeButton = ({ show, set }) => (
    <button
      type="button"
      title="Hold to reveal"
      onMouseDown={() => set(true)}
      onMouseUp={() => set(false)}
      onMouseLeave={() => set(false)}
      onTouchStart={() => set(true)}
      onTouchEnd={() => set(false)}
      style={{ position: 'absolute', right: '8px', background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: show ? 'var(--teal,#0d9488)' : '#94a3b8', display: 'flex', alignItems: 'center' }}
    >
      {show ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );

  const handleSaveSftp = async () => {
    setSftpLoading(true);
    setSftpStatus('Testing and saving connection details...');
    try {
      const payload = {
        host: sftpHost.trim(),
        port: parseInt(sftpPort, 10) || 22,
        username: sftpUser.trim(),
        inbound_835_folder: sftpInbound835.trim(),
        inbound_837_folder: sftpInbound837.trim(),
        outbound_mir_folder: sftpOutboundMir.trim(),
        connection_type: 'UNIFIED',
        use_same_server: true
      };
      // Blank means preserve the existing encrypted password.
      if (sftpPass.trim()) {
        payload.password = sftpPass.trim();
      }
      const res = await fetch('/edi835/api/sftp/save/', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });
      const data = await readJsonResponse(res);
      if (res.ok && data.success) {
        const savedConfigId =
          data.config_id ??
          data.id ??
          data.config?.id ??
          data.config?.config_id;

        const normalizedConfigId = String(savedConfigId ?? '').trim();
        if (!normalizedConfigId) {
          throw new Error(
            "SFTP was saved, but the server did not return its configuration ID."
          );
        }

        setSftpConfigId(normalizedConfigId);
        setSftpConnected(Boolean(data.connected));
        setSftpHasPassword(Boolean(data.has_password || sftpHasPassword || sftpPass.trim()));
        setSftpPass('');
        setShowSftpPass(false);
        setSftpStatus(`✓ Default SFTP Saved. Status: ${data.connected ? 'CONNECTED' : 'SAVED'}`);
      } else {
        setSftpStatus(`❌ Failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      setSftpStatus(`❌ Failed: ${err.message}`);
    } finally {
      setSftpLoading(false);
    }
  };

  const handleSaveSmtp = async () => {
    setSmtpLoading(true);
    setSmtpStatus('Saving SMTP default configuration...');
    try {
      const payload = {
        sender_name: smtpSenderName.trim(),
        sender_email: smtpSenderEmail.trim(),
        smtp_host: smtpHost.trim(),
        smtp_port: parseInt(smtpPort, 10) || 587,
        smtp_username: smtpUser.trim(),
        security: smtpSecurity,
        reply_to: smtpReplyTo.trim() || null
      };
      // Blank means preserve the existing encrypted password.
      if (smtpPass.trim()) {
        payload.smtp_password = smtpPass.trim();
      }
      const res = await fetch('/admin-panel/api/default-smtp/', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });
      const data = await readJsonResponse(res);
      if (res.ok && data.success) {
        setSmtpHasPassword(Boolean(data.config?.has_password || smtpHasPassword || smtpPass.trim()));
        setSmtpPass('');
        setShowSmtpPass(false);
        setSmtpStatus('✓ Default SMTP configuration saved successfully.');
      } else {
        setSmtpStatus(`❌ Failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      setSmtpStatus(`❌ Failed: ${err.message}`);
    } finally {
      setSmtpLoading(false);
    }
  };

  return (
    <section className="view on" id="v-defaults">
      <div className="hdr-row">
        <div>
          <div className="eyebrow">System Standards</div>
          <h1 style={{ margin: 0 }}>Default Configurations</h1>
          <p className="sub">Define global fallback SMTP and SFTP settings. Clients can choose to use these system defaults to bypass separate tenant setups.</p>
        </div>
      </div>

      <div className="admin-responsive-grid" style={{ display: 'grid', gap: '20px', marginTop: '20px' }}>

        {/* SFTP Default Card */}
        <div className="card" style={{ padding: '20px' }}>
          <h2 style={{ margin: '0 0 10px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            📁 Global Default SFTP Server Settings
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--ink-2)', marginBottom: '16px' }}>Used when a client checks the "Use Default SFTP" onboarding step.</p>

          <div className="field">
            <label>SFTP Host</label>
            <input type="text" value={sftpHost} onChange={e => setSftpHost(e.target.value)} placeholder="sftp.provider.com" />
          </div>
          <div className="field">
            <label>SFTP Port</label>
            <input type="text" value={sftpPort} onChange={e => setSftpPort(e.target.value)} placeholder="22" />
          </div>
          <div className="field">
            <label>Username</label>
            <input type="text" value={sftpUser} onChange={e => setSftpUser(e.target.value)} placeholder="sftp_user" autoComplete="off" />
          </div>
          <div className="field">
            <label>Password / Private Key Passphrase</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type={showSftpPass ? 'text' : 'password'}
                value={sftpPass}
                onChange={e => { setSftpPass(e.target.value); if (sftpConnected && e.target.value) setSftpConnected(false); }}
                placeholder={sftpHasPassword ? 'Saved — enter a new password to change' : 'Enter SFTP password'}
                style={{ width: '100%', paddingRight: '34px', background: sftpHasPassword && !sftpPass ? '#f8fafc' : '#fff' }}
                autoComplete="new-password"
              />
              <EyeButton show={showSftpPass} set={setShowSftpPass} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '8px 0 14px' }}>
            <button className="btn primary" onClick={handleSaveSftp} disabled={sftpLoading} style={{ padding: '6px 16px', fontSize: '13px' }}>
              {sftpLoading ? 'Testing...' : 'Save & Test Connection'}
            </button>
          </div>

          <div style={{ borderTop: '1px solid var(--line-soft)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <FolderBrowse label="Inbound 835 Folder" value={sftpInbound835} onChange={setSftpInbound835} setter={setSftpInbound835} />
            <FolderBrowse label="Inbound 837 Folder" value={sftpInbound837} onChange={setSftpInbound837} setter={setSftpInbound837} />
            <FolderBrowse label="Outbound MIR Folder" value={sftpOutboundMir} onChange={setSftpOutboundMir} setter={setSftpOutboundMir} />
          </div>

          {sftpStatus && (
            <div style={{ padding: '8px 12px', background: 'var(--paper)', borderRadius: '4px', fontSize: '12px', margin: '12px 0', border: '1px solid var(--line-soft)' }}>
              {sftpStatus}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button className="btn primary" onClick={handleSaveSftp} disabled={sftpLoading}>
              {sftpLoading ? 'Saving...' : '💾 Save SFTP Default'}
            </button>
          </div>
        </div>

        {/* SMTP Default Card */}
        <div className="card" style={{ padding: '20px' }}>
          <h2 style={{ margin: '0 0 10px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ✉️ Global Default SMTP Email Settings
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--ink-2)', marginBottom: '16px' }}>Fallback sender for account credentials, password resets, and validation alerts.</p>

          <div className="field"><label>Sender Name</label><input type="text" value={smtpSenderName} onChange={e => setSmtpSenderName(e.target.value)} placeholder="OneSmarter Inc" /></div>
          <div className="field"><label>Sender Email</label><input type="email" value={smtpSenderEmail} onChange={e => setSmtpSenderEmail(e.target.value)} placeholder="support@onesmarter.com" /></div>
          <div className="field"><label>SMTP Host</label><input type="text" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} placeholder="smtp.sendgrid.net" /></div>
          <div className="field"><label>SMTP Port</label><input type="text" value={smtpPort} onChange={e => setSmtpPort(e.target.value)} placeholder="587" /></div>
          <div className="field"><label>SMTP Username</label><input type="text" value={smtpUser} onChange={e => setSmtpUser(e.target.value)} placeholder="apikey" autoComplete="off" /></div>
          <div className="field">
            <label>SMTP Password</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type={showSmtpPass ? 'text' : 'password'}
                value={smtpPass}
                onChange={(event) => {
                  setSmtpPass(event.target.value);
                }}
                placeholder={
                  smtpHasPassword
                    ? 'Saved — enter a new password to change'
                    : 'Enter SMTP password'
                }
                style={{
                  width: '100%',
                  paddingRight: '34px',
                }}
                autoComplete="new-password"
              />
              <EyeButton show={showSmtpPass} set={setShowSmtpPass} />
            </div>
          </div>
          <div className="field">
            <label>Security Protocol</label>
            <select value={smtpSecurity} onChange={e => setSmtpSecurity(e.target.value)}>
              <option value="STARTTLS">STARTTLS</option>
              <option value="SSL_TLS">SSL / TLS</option>
              <option value="NONE">None</option>
            </select>
          </div>
          <div className="field"><label>Reply-To Email</label><input type="email" value={smtpReplyTo} onChange={e => setSmtpReplyTo(e.target.value)} placeholder="support@onesmarter.com" /></div>

          {smtpStatus && (
            <div style={{ padding: '8px 12px', background: 'var(--paper)', borderRadius: '4px', fontSize: '12px', margin: '12px 0', border: '1px solid var(--line-soft)' }}>
              {smtpStatus}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button className="btn primary" onClick={handleSaveSmtp} disabled={smtpLoading}>
              {smtpLoading ? 'Saving...' : '💾 Save SMTP Default'}
            </button>
          </div>
        </div>
      </div>

      {browserState && (
        <SftpBrowserModal
          isOpen={Boolean(browserState)}
          configId={browserState?.configId}
          initialPath={browserState?.initialPath}
          onSelectFolder={browserState?.onSelectFolder}
          onClose={() => setBrowserState(null)}
        />
      )}
    </section>
  );
}

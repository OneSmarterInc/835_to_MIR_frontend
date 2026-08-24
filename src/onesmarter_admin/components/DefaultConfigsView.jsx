import React, { useState, useEffect } from 'react';
import { fetchClientSmtpConfig } from '../services/api';

export default function DefaultConfigsView() {
  const [sftpHost, setSftpHost] = useState('');
  const [sftpPort, setSftpPort] = useState('22');
  const [sftpUser, setSftpUser] = useState('');
  const [sftpPass, setSftpPass] = useState('');
  const [sftpInbound835, setSftpInbound835] = useState('/inbound/835');
  const [sftpInbound837, setSftpInbound837] = useState('/inbound/837');
  const [sftpOutboundMir, setSftpOutboundMir] = useState('/outbound/mir');
  const [sftpStatus, setSftpStatus] = useState('');
  const [sftpLoading, setSftpLoading] = useState(false);

  const [smtpSenderName, setSmtpSenderName] = useState('OneSmarter Notification');
  const [smtpSenderEmail, setSmtpSenderEmail] = useState('notifications@onesmarter.com');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpSecurity, setSmtpSecurity] = useState('STARTTLS');
  const [smtpReplyTo, setSmtpReplyTo] = useState('');
  const [smtpStatus, setSmtpStatus] = useState('');
  const [smtpLoading, setSmtpLoading] = useState(false);

  useEffect(() => {
    // Load default SFTP config
    fetch('/edi835/api/sftp/get/')
      .then(res => res.json())
      .then(data => {
        if (data && data.success && data.configs) {
          // Find config where client is null/none
          const cfg = data.configs.find(c => !c.client_id && !c.client);
          if (cfg) {
            setSftpHost(cfg.host || '');
            setSftpPort(String(cfg.port || '22'));
            setSftpUser(cfg.username || '');
            setSftpInbound835(cfg.inbound_835_folder || '');
            setSftpInbound837(cfg.inbound_837_folder || '');
            setSftpOutboundMir(cfg.outbound_mir_folder || '');
            setSftpStatus(`Saved Connection status: ${cfg.status || 'PENDING'}`);
          }
        }
      })
      .catch(err => console.error("Failed to load default SFTP", err));

    // Load default SMTP config
    fetch('/admin-panel/api/default-smtp/')
      .then(res => res.json())
      .then(data => {
        if (data && data.success && data.config) {
          const cfg = data.config;
          setSmtpSenderName(cfg.sender_name || '');
          setSmtpSenderEmail(cfg.sender_email || '');
          setSmtpHost(cfg.smtp_host || '');
          setSmtpPort(String(cfg.smtp_port || '587'));
          setSmtpUser(cfg.smtp_username || '');
          setSmtpSecurity(cfg.security || 'STARTTLS');
          setSmtpReplyTo(cfg.reply_to || '');
          setSmtpStatus('Loaded SMTP configuration from database.');
        }
      })
      .catch(err => console.error("Failed to load default SMTP", err));
  }, []);

  const handleSaveSftp = async () => {
    setSftpLoading(true);
    setSftpStatus('Testing and saving connection details...');
    try {
      const payload = {
        host: sftpHost.trim(),
        port: parseInt(sftpPort, 10) || 22,
        username: sftpUser.trim(),
        password: sftpPass.trim(),
        inbound_835_folder: sftpInbound835.trim(),
        inbound_837_folder: sftpInbound837.trim(),
        outbound_mir_folder: sftpOutboundMir.trim(),
        connection_type: 'UNIFIED',
        use_same_server: true
      };
      const res = await fetch('/edi835/api/sftp/save/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSftpStatus(`✓ SFTP Default Saved successfully. (Connection Status: ${data.connected ? 'CONNECTED' : 'FAILED' })`);
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
        smtp_password: smtpPass.trim(),
        security: smtpSecurity,
        reply_to: smtpReplyTo.trim() || null
      };
      const res = await fetch('/admin-panel/api/default-smtp/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '20px', marginTop: '20px' }}>
        {/* SFTP Default Card */}
        <div className="card" style={{ padding: '20px' }}>
          <h2 style={{ margin: '0 0 10px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            📁 Global Default SFTP Server Settings
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--ink-2)', marginBottom: '16px' }}>Used when a client checks the "Use Default SFTP" onboarding step.</p>

          <div className="field">
            <label>SFTP Host</label>
            <input type="text" value={sftpHost} onChange={(e) => setSftpHost(e.target.value)} placeholder="sftp.provider.com" />
          </div>
          <div className="field">
            <label>SFTP Port</label>
            <input type="text" value={sftpPort} onChange={(e) => setSftpPort(e.target.value)} placeholder="22" />
          </div>
          <div className="field">
            <label>Username</label>
            <input type="text" value={sftpUser} onChange={(e) => setSftpUser(e.target.value)} placeholder="sftp_user" />
          </div>
          <div className="field">
            <label>Password / Private Key Passphrase</label>
            <input type="password" value={sftpPass} onChange={(e) => setSftpPass(e.target.value)} placeholder="••••••••" />
          </div>
          <div className="field">
            <label>Inbound 835 Folder</label>
            <input type="text" value={sftpInbound835} onChange={(e) => setSftpInbound835(e.target.value)} placeholder="/inbound/835" />
          </div>
          <div className="field">
            <label>Inbound 837 Folder</label>
            <input type="text" value={sftpInbound837} onChange={(e) => setSftpInbound837(e.target.value)} placeholder="/inbound/837" />
          </div>
          <div className="field">
            <label>Outbound MIR Folder</label>
            <input type="text" value={sftpOutboundMir} onChange={(e) => setSftpOutboundMir(e.target.value)} placeholder="/outbound/mir" />
          </div>

          {sftpStatus && (
            <div style={{ padding: '8px 12px', background: 'var(--paper)', borderRadius: '4px', fontSize: '12px', margin: '12px 0', border: '1px solid var(--line-soft)' }}>
              {sftpStatus}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button className="btn primary" onClick={handleSaveSftp} disabled={sftpLoading}>
              {sftpLoading ? 'Testing...' : 'Test &amp; Save SFTP Default'}
            </button>
          </div>
        </div>

        {/* SMTP Default Card */}
        <div className="card" style={{ padding: '20px' }}>
          <h2 style={{ margin: '0 0 10px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ✉️ Global Default SMTP Email Settings
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--ink-2)', marginBottom: '16px' }}>Fallback sender for account credentials, password resets, and validation alerts.</p>

          <div className="field">
            <label>Sender Name</label>
            <input type="text" value={smtpSenderName} onChange={(e) => setSmtpSenderName(e.target.value)} placeholder="OneSmarter Inc" />
          </div>
          <div className="field">
            <label>Sender Email</label>
            <input type="email" value={smtpSenderEmail} onChange={(e) => setSmtpSenderEmail(e.target.value)} placeholder="support@onesmarter.com" />
          </div>
          <div className="field">
            <label>SMTP Host</label>
            <input type="text" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.sendgrid.net" />
          </div>
          <div className="field">
            <label>SMTP Port</label>
            <input type="text" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" />
          </div>
          <div className="field">
            <label>SMTP Username</label>
            <input type="text" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="apikey" />
          </div>
          <div className="field">
            <label>SMTP Password</label>
            <input type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder="••••••••" />
          </div>
          <div className="field">
            <label>Security Protocol</label>
            <select value={smtpSecurity} onChange={(e) => setSmtpSecurity(e.target.value)}>
              <option value="STARTTLS">STARTTLS</option>
              <option value="SSL_TLS">SSL / TLS</option>
              <option value="NONE">None</option>
            </select>
          </div>
          <div className="field">
            <label>Reply-To Email</label>
            <input type="email" value={smtpReplyTo} onChange={(e) => setSmtpReplyTo(e.target.value)} placeholder="support@onesmarter.com" />
          </div>

          {smtpStatus && (
            <div style={{ padding: '8px 12px', background: 'var(--paper)', borderRadius: '4px', fontSize: '12px', margin: '12px 0', border: '1px solid var(--line-soft)' }}>
              {smtpStatus}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button className="btn primary" onClick={handleSaveSmtp} disabled={smtpLoading}>
              {smtpLoading ? 'Saving...' : 'Save SMTP Default'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

import React, { useState } from 'react';
import { completeOffboardingStep, redoOffboardingStep } from '../services/api';
import StepNotesHistory from './StepNotesHistory';

const iconOnlyButtonStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  width: '34px',
  height: '34px',
  padding: '0',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const RedoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 3v6h6" />
  </svg>
);

const NotesIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
  </svg>
);

const ZipIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 4h6l2 2h8v14H4Z" />
    <path d="M14 6v3h-2v3h2v3h-2v3" />
  </svg>
);

function ClientOffboarding({ clients, activeClientId, onSelectClient, offboardingState, onRefresh, onOpenNotes }) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [archiveDownloading, setArchiveDownloading] = useState(false);

  const currentClient = clients.find(c => c.id === activeClientId);

  const getStepStatus = (stepNum) => {
    if (!offboardingState || !offboardingState.steps) return 'PENDING';
    const step = offboardingState.steps.find(s => s.step === stepNum);
    return step ? step.status : 'PENDING';
  };

  const getStepDocument = (stepNum) => {
    if (!offboardingState || !offboardingState.steps) return null;
    const step = offboardingState.steps.find(s => s.step === stepNum);
    return step ? step.document_path : null;
  };

  const handleFileUpload = async (stepNum, file) => {
    if (!activeClientId) return;
    try {
      await completeOffboardingStep(activeClientId, stepNum, file);
      onRefresh();
    } catch (e) {
      alert(e.message || 'Error completing step');
    }
  };

  const handleComplete = async (stepNum) => {
    if (!activeClientId) return;
    try {
      await completeOffboardingStep(activeClientId, stepNum);
      onRefresh();
    } catch (e) {
      alert(e.message || 'Error completing step');
    }
  };

  const handleRedo = async (stepNum) => {
    if (!activeClientId) return;
    try {
      await redoOffboardingStep(activeClientId, stepNum);
      onRefresh();
    } catch (e) {
      alert(e.message || 'Error undoing step');
    }
  };

  const handleArchiveDownload = async () => {
    if (!activeClientId || !step1Done || archiveDownloading) return;
    setArchiveDownloading(true);
    try {
      const response = await fetch(`/api/download-zip/?type=all&client=${encodeURIComponent(activeClientId)}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create the client archive.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${currentClient?.client_code || currentClient?.name || 'client'}_835_MIR_RECON_archive.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      await handleComplete(2);
    } catch (error) {
      alert(error.message || 'Error downloading client archive');
    } finally {
      setArchiveDownloading(false);
    }
  };

  const handleDestroyKeys = async () => {
    if (confirmInput !== currentClient?.name) return;
    try {
      await completeOffboardingStep(activeClientId, 3);
      setIsConfirmOpen(false);
      onRefresh();
    } catch (e) {
      alert(e.message || 'Error destroying keys');
    }
  };

  const step1Done = getStepStatus(1) === 'COMPLETED';
  const step2Done = getStepStatus(2) === 'COMPLETED';
  const step3Done = getStepStatus(3) === 'COMPLETED';
  
  const step1Doc = getStepDocument(1);

  return (
    <section className="view on" id="v-offboard">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="eyebrow">Lifecycle Termination</div>
          <h1>Offboarding Procedures</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {clients.length > 0 && (
            <select 
              value={activeClientId || ''} 
              onChange={(e) => onSelectClient(e.target.value)}
              style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--line)', background: 'var(--surface)', cursor: 'pointer', outline: 'none' }}
            >
              <option value="" disabled>Select a Client</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>
      <p className="sub">Cryptographic key destruction and certified data return upon client contract conclusion.</p>
      
      {!activeClientId ? (
        <div style={{ marginTop: '20px', padding: '20px', textAlign: 'center', color: 'var(--mute)' }}>
          Please select a client to view offboarding procedures.
        </div>
      ) : (
        <div className="ladder" style={{ paddingLeft: '10px' }}>
          {/* Step 1 */}
          <div className="rung" style={{ padding: '16px 0', borderBottom: '1px solid var(--line)' }}>
            <div className="mark" style={{ background: step1Done ? 'var(--teal)' : undefined, color: step1Done ? '#fff' : undefined }}>{step1Done ? '✓' : '1'}</div>
            <div className="txt" style={{ flex: 1 }}>
              <h3>Termination Notice Recorded</h3>
              <div className="meta">Effective date registered in database</div>
              
              <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {!step1Done ? (
                  <label className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '4px', fontSize: '12px' }}>
                    <span>📎 Upload PDF / Doc</span>
                    <input 
                      type="file" 
                      hidden 
                      accept=".pdf,.doc,.docx,.txt" 
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleFileUpload(1, e.target.files[0]);
                        }
                      }}
                    />
                  </label>
                ) : (
                  <button 
                    type="button" 
                    className="btn" 
                    onClick={() => handleRedo(1)}
                    title="Redo termination notice"
                    aria-label="Redo termination notice"
                    style={{ ...iconOnlyButtonStyle, color: 'var(--brick)' }}
                  >
                    <RedoIcon />
                  </button>
                )}

                <button 
                  type="button" 
                  className="btn" 
                  onClick={() => onOpenNotes('offboard_step_1', 'Termination Notice Recorded')}
                  title="View termination notice notes"
                  aria-label="View termination notice notes"
                  style={iconOnlyButtonStyle}
                >
                  <NotesIcon />
                </button>
              </div>

              {step1Done && step1Doc && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--teal)', fontWeight: '600' }}>
                  ✓ Uploaded document: {step1Doc}
                </div>
              )}
              <StepNotesHistory clientId={activeClientId} stepKey="offboard_step_1" />
            </div>
          </div>

          {/* Step 2 */}
          <div className="rung" style={{ padding: '16px 0', borderBottom: '1px solid var(--line)' }}>
            <div className="mark" style={{ background: step2Done ? 'var(--teal)' : undefined, color: step2Done ? '#fff' : undefined }}>{step2Done ? '✓' : '2'}</div>
            <div className="txt">
              <h3>Archive Returned to Client</h3>
              <div className="meta">Exported in standard format with intact digital signatures</div>
              
              <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {!step2Done ? (
                  <button
                    type="button"
                    onClick={handleArchiveDownload}
                    disabled={!step1Done || archiveDownloading}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      textDecoration: 'none',
                      background: 'var(--ink)',
                      border: '1px solid var(--ink)',
                      padding: '6px 12px',
                      fontSize: '12px',
                      color: '#fff',
                      borderRadius: '4px',
                      opacity: !step1Done ? 0.5 : 1,
                      cursor: !step1Done || archiveDownloading ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <ZipIcon />
                    <span>{archiveDownloading ? 'Preparing Archive…' : 'Download Archive (835, MIR & RECON)'}</span>
                  </button>
                ) : (
                  <button 
                    type="button" 
                    className="btn" 
                    onClick={() => handleRedo(2)}
                    title="Redo archive return"
                    aria-label="Redo archive return"
                    style={{ ...iconOnlyButtonStyle, color: 'var(--brick)' }}
                  >
                    <RedoIcon />
                  </button>
                )}
                
                <button 
                  type="button" 
                  className="btn" 
                  onClick={() => onOpenNotes('offboard_step_2', 'Archive Returned to Client')}
                  title="View archive return notes"
                  aria-label="View archive return notes"
                  style={iconOnlyButtonStyle}
                >
                  <NotesIcon />
                </button>
              </div>
              <StepNotesHistory clientId={activeClientId} stepKey="offboard_step_2" />
            </div>
          </div>

          {/* Step 3 */}
          <div className="rung" style={{ padding: '16px 0' }}>
            <div className="mark" style={{ background: step3Done ? 'var(--brick)' : 'var(--brick-bg)', color: step3Done ? '#fff' : 'var(--brick)' }}>{step3Done ? '✓' : '3'}</div>
            <div className="txt" style={{ flex: 1 }}>
              <h3>Offboard Client</h3>
              <div className="meta" style={{ color: 'var(--brick)', fontWeight: '600' }}>PERMANENT OFFBOARDING — ALL USER ACCESS WILL BE REVOKED</div>
              
              <div style={{ marginTop: '12px' }}>
                {!step3Done ? (
                  <button 
                    type="button" 
                    className="btn danger" 
                    onClick={() => {
                      setConfirmInput('');
                      setIsConfirmOpen(true);
                    }}
                    disabled={!step2Done}
                    style={{ background: 'var(--brick-bg)', borderColor: 'var(--brick)', color: 'var(--brick)', fontWeight: '600', padding: '8px 16px', opacity: !step2Done ? 0.5 : 1 }}
                  >
                    ⚠️ Offboard Client
                  </button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--brick)', fontWeight: 'bold' }}>✓ Client has been offboarded. All user access revoked.</span>
                    <button 
                      type="button" 
                      className="btn" 
                      onClick={() => handleRedo(3)}
                      style={{ background: 'var(--surface)', border: '1px solid var(--line)', padding: '6px 12px', fontSize: '12px' }}
                    >
                      🔄 Undo Offboard
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {isConfirmOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2 style={{ color: 'var(--brick)' }}>⚠️ Confirm Client Offboarding</h2>
            <p style={{ marginTop: '8px' }}>This action will:</p>
            <ul style={{ margin: '8px 0 12px 20px', fontSize: '13px', lineHeight: '1.7' }}>
              <li>Set the client status to <strong>INACTIVE</strong></li>
              <li>Mark the client as <strong>Offboarded</strong></li>
              <li>Deactivate <strong>all users</strong> belonging to this client</li>
              <li>Immediately <strong>revoke all active sessions</strong></li>
              <li>Block all future login attempts for this client's users</li>
            </ul>
            <p>Type <strong>{currentClient?.name}</strong> to confirm.</p>
            <input 
              type="text" 
              value={confirmInput} 
              onChange={e => setConfirmInput(e.target.value)}
              placeholder={currentClient?.name} 
              style={{ width: '100%', padding: '10px', marginTop: '10px', border: '1px solid var(--line)', borderRadius: '4px' }}
            />
            <div className="actions" style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
              <button 
                type="button" 
                className="btn primary" 
                onClick={handleDestroyKeys}
                disabled={confirmInput !== currentClient?.name}
                style={{ background: 'var(--brick)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', opacity: confirmInput !== currentClient?.name ? 0.5 : 1 }}
              >
                Confirm Offboard
              </button>
              <button 
                type="button" 
                className="btn" 
                onClick={() => setIsConfirmOpen(false)}
                style={{ padding: '8px 16px', borderRadius: '4px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default ClientOffboarding;

import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import ClientsTable from './components/ClientsTable';
import ClientOffboarding from './components/ClientOffboarding';
import OnboardingLadder from './components/OnboardingLadder';
import DocumentsView from './components/DocumentsView';
import FilesView from './components/FilesView';
import GoLiveView from './components/GoLiveView';
import AccessView from './components/AccessView';
import DefaultConfigsView from './components/DefaultConfigsView';
import AuditLogView from './components/AuditLogView';
import AddClientModal from './components/modals/AddClientModal';
import NotesModal from './components/modals/NotesModal';
import AddRoleModal from './components/modals/AddRoleModal';
import RedoConfirmModal from './components/modals/RedoConfirmModal';
import RevokeClientModal from './components/modals/RevokeClientModal';
import FeedbackModal from './components/modals/FeedbackModal';
import LoginGate from './components/login/LoginGate';
import MappingApp from './components/MappingTool/MappingApp';
import ConversionsView from '../pages/ConversionsView';
import FileViewerModal from '../components/FileViewerModal';
import ResultView from '../pages/ResultView';
import SftpAutomationView from './components/SftpAutomationView';
import ClientSelectDropdown from './components/ClientSelectDropdown';
import OffboardedClientBanner from './components/OffboardedClientBanner';

import { fetchClients, fetchClientState, createClient, deleteClient, redoStep, fetchEmployeeRoles, logoutAdmin, fetchOffboardingState, completeOffboardingStep, redoOffboardingStep } from './services/api';

export default function App({ user, onLogout }) {
  const isMappingRoute = window.location.pathname.startsWith('/mapping');
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(() => {
    if (user) return user;
    try {
      const storedUser = localStorage.getItem('onesmarter_admin_user');
      if (storedUser) return JSON.parse(storedUser);
    } catch (error) {
      console.warn('Could not restore the signed-in administrator identity.', error);
    }
    return { name: "Sahil Asarkar", email: "admin@onesmarter.com", role: "Admin", client: "OneSmarter" };
  });

  const [clients, setClients] = useState([]);
  const [activeClientId, setActiveClientId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('client') || '';
  });
  const [clientState, setClientState] = useState(null);
  const [offboardingState, setOffboardingState] = useState(null);
  const [activeNav, setActiveNav] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const n = params.get('nav');
    if (n === 'onboarding' || n === 'onboard') return 'onboard';
    if (n) return n;
    if (params.get('client')) return 'onboard';
    return 'clients';
  });
  const [roles, setRoles] = useState([]);
  const [adminTrackedFiles, setAdminTrackedFiles] = useState([]);

  const [adminViewerFileId, setAdminViewerFileId] = useState(null);

  // Modal states
  const [isAddClientOpen, setIsAddClientOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [activeNoteTarget, setActiveNoteTarget] = useState({ stepKey: '', stepTitle: '' });
  const [isAddRoleOpen, setIsAddRoleOpen] = useState(false);
  const [appFeedback, setAppFeedback] = useState({ isOpen: false, kind: 'ok', title: '', content: '' });
  const [isRedoOpen, setIsRedoOpen] = useState(false);
  const [redoTarget, setRedoTarget] = useState({ stepKey: '', stepNum: null });
  const [redoLoading, setRedoLoading] = useState(false);
  const [isRevokeOpen, setIsRevokeOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revokeLoading, setRevokeLoading] = useState(false);
  
  // Offboarding states
  const [isOffboardConfirmOpen, setIsOffboardConfirmOpen] = useState(false);
  const [offboardConfirmInput, setOffboardConfirmInput] = useState('');
  const [offboardFileUploaded, setOffboardFileUploaded] = useState(false);
  const [offboardFileName, setOffboardFileName] = useState('');
  const [offboardNotes, setOffboardNotes] = useState('');
  const [offboardStep1Done, setOffboardStep1Done] = useState(false);


  useEffect(() => {
    if (!isAuthenticated) return;
    loadClients();
    loadRoles();

    // Auto-update client status in real-time every 3 seconds
    const interval = setInterval(() => {
      loadClients();
      if (activeClientId) {
        loadClientWorkflow(activeClientId);
      }
    }, 3000);

    const onFocus = () => {
      loadClients();
      if (activeClientId) {
        loadClientWorkflow(activeClientId);
      }
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [isAuthenticated, activeClientId]);

  const loadAdminTrackedFiles = async () => {
    try {
        const token = localStorage.getItem('onesmarter_admin_token');
        const headers = token ? { Authorization: `Token ${token}` } : {};
        const res = await fetch('/edi835/api/tracked-files/', {
            credentials: 'include',
            headers,
        });

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            throw new Error(`Tracked-files API returned a non-JSON response (${res.status})`);
        }
        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || `HTTP ${res.status}`);
        }

        setAdminTrackedFiles(Array.isArray(data.files) ? data.files : []);
    } catch (err) {
        console.error("Failed to load admin tracked files:", err);
        // Preserve the last successful result during a transient refresh error.
    }
};

  useEffect(() => {
    if (isAuthenticated && activeNav === 'conversions') {
      loadAdminTrackedFiles();
      const interval = setInterval(loadAdminTrackedFiles, 3000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, activeNav]);

  // Sync state to URL for persistence on refresh
  useEffect(() => {
    if (!activeNav && !activeClientId) return;
    const url = new URL(window.location.href);
    let changed = false;
    
    if (activeNav) {
      if (url.searchParams.get('nav') !== activeNav) {
        url.searchParams.set('nav', activeNav);
        changed = true;
      }
    } else if (url.searchParams.has('nav')) {
      url.searchParams.delete('nav');
      changed = true;
    }
    
    if (activeClientId) {
      if (url.searchParams.get('client') !== activeClientId) {
        url.searchParams.set('client', activeClientId);
        changed = true;
      }
    } else if (url.searchParams.has('client')) {
      url.searchParams.delete('client');
      changed = true;
    }
    
    if (changed) {
      window.history.replaceState({}, '', url.toString());
    }
  }, [activeNav, activeClientId]);

  const loadClients = async () => {
    try {
      const data = await fetchClients();
      const list = data.results || data || [];
      setClients(list);
      if (list.length > 0 && !activeClientId) {
        setActiveClientId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load clients:', err);
    }
  };

  const loadRoles = async () => {
    try {
      const data = await fetchEmployeeRoles();
      setRoles(data.roles || []);
    } catch (err) {
      console.error('Failed to load employee roles:', err);
    }
  };

  // ==========================================
  // FETCH CLIENT DATA
  // ==========================================
  const loadClientWorkflow = async (clientId) => {
    if (!clientId) return;
    try {
      const state = await fetchClientState(clientId);
      setClientState(state);
      
      const offbState = await fetchOffboardingState(clientId);
      setOffboardingState(offbState);
    } catch (err) {
      console.error('Failed to load client workflow:', err);
    }
  };

  const handleSelectClient = (clientId) => {
    setActiveClientId(clientId);
    loadClientWorkflow(clientId);
  };

  const handleSelectClientInGoLive = (clientId) => {
    setActiveClientId(clientId);
    loadClientWorkflow(clientId);
  };

  const handleGoLiveCompleted = (clientId) => {
    const onboardingUrl = new URL(window.location.href);
    onboardingUrl.searchParams.set('nav', 'onboard');
    onboardingUrl.searchParams.set('client', clientId);
    onboardingUrl.searchParams.set('step', '14');
    onboardingUrl.hash = 'step-14';
    window.history.pushState({}, document.title, onboardingUrl.toString());
    setActiveClientId(clientId);
    setActiveNav('onboard');
    loadClientWorkflow(clientId);
  };

  const handleOpenRevoke = (client) => {
    const target = typeof client === 'string' 
      ? clients.find(c => c.id === client) || { id: client, name: client } 
      : client;
    setRevokeTarget(target);
    setIsRevokeOpen(true);
  };

  const handleConfirmRevoke = async ({ confirmationName, password }) => {
    if (!revokeTarget?.id) return;
    setRevokeLoading(true);
    try {
      await deleteClient(revokeTarget.id, confirmationName, password);
      await loadClients();
      if (activeClientId === revokeTarget.id) {
        setActiveClientId(null);
        setClientState(null);
        setActiveNav('clients');
      }
      setIsRevokeOpen(false);
      setRevokeTarget(null);
    } catch (err) {
      console.error('Failed to revoke client:', err);
      setAppFeedback({ isOpen: true, kind: 'bad', title: 'Revocation Failed', content: err.message });
    } finally {
      setRevokeLoading(false);
    }
  };

  const handleClientCreated = (newClient) => {
    loadClients();
    setActiveClientId(newClient.id);
    loadClientWorkflow(newClient.id);
  };

  const handleOpenNotes = (stepKey, stepTitle) => {
    setActiveNoteTarget({ stepKey, stepTitle });
    setIsNotesOpen(true);
  };

  const handleOpenRedo = (stepKey, stepNum) => {
    setRedoTarget({ stepKey, stepNum });
    setIsRedoOpen(true);
  };

  const handleConfirmRedo = async () => {
    if (!redoTarget.stepKey || !activeClientId) return;
    setRedoLoading(true);
    try {
      await redoStep(activeClientId, redoTarget.stepKey);
      await loadClientWorkflow(activeClientId);
      await loadClients();
      setIsRedoOpen(false);
    } catch (err) {
      setAppFeedback({ isOpen: true, kind: 'bad', title: 'Redo Failed', content: err.message });
    } finally {
      setRedoLoading(false);
    }
  };

  const handleLoginSuccess = (res) => {
    if (res && res.user) {
      localStorage.setItem('onesmarter_admin_user', JSON.stringify(res.user));
      setCurrentUser(res.user);
    }
    setIsAuthenticated(true);
  };

  const handleSignOut = async () => {
    if (onLogout) {
      await onLogout();
    } else {
      await logoutAdmin();
      localStorage.removeItem('onesmarter_admin_token');
      localStorage.removeItem('onesmarter_admin_user');
      setCurrentUser(null);
      setIsAuthenticated(false);
    }
  };

  const currentClient = clients.find(c => c.id === activeClientId) || clients[0];

  if (!isAuthenticated) {
    return <LoginGate onLoginSuccess={handleLoginSuccess} />;
  }

  if (isMappingRoute) {
    return (
      <MappingApp
        clients={clients}
        activeClientId={activeClientId}
        currentClient={currentClient}
        onSelectClient={handleSelectClient}
        onSignOut={handleSignOut}
        currentUser={currentUser}
      />
    );
  }

  const selectedClientIsOffboarded = String(
    clientState?.client?.stage || clients.find((client) => client.id === activeClientId)?.stage || ''
  ).toLowerCase() === 'offboarded';
  const selectedOperationalClient = clientState?.client || clients.find((client) => client.id === activeClientId) || null;

  return (
    <>
      <Header
        onSignOut={handleSignOut}
        currentUser={currentUser}
        onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
        isSidebarOpen={isSidebarOpen}
      />

      <div className="shell">
        {isSidebarOpen && (
          <button
            type="button"
            className="admin-sidebar-backdrop"
            aria-label="Close navigation menu"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
        {/* Left Navigation Sidebar matching POC exactly */}
        <nav
          className="rail"
          aria-hidden={!isSidebarOpen}
          onClick={(event) => {
            if (event.target.closest('.navitem')) setIsSidebarOpen(false);
          }}
        >
          <div className="grp eyebrow">Clients</div>
          <button className={`navitem ${activeNav === 'clients' ? 'on' : ''}`} onClick={() => setActiveNav('clients')}>
            <span>All Clients</span>
            <span className="count">{clients.length}</span>
          </button>
          <button className={`navitem ${activeNav === 'onboard' ? 'on' : ''}`} onClick={() => setActiveNav('onboard')}>
            <span>Onboarding</span>
          </button>
          <button className={`navitem ${activeNav === 'docs' ? 'on' : ''}`} onClick={() => setActiveNav('docs')}>
            <span>Documents</span>
          </button>
          <button className={`navitem ${activeNav === 'files' ? 'on' : ''}`} onClick={() => setActiveNav('files')}>
            <span>Files</span>
          </button>
          <button className={`navitem ${activeNav === 'conversions' ? 'on' : ''}`} onClick={() => setActiveNav('conversions')}>
            <span>Conversions</span>
          </button>
          <button className={`navitem ${activeNav === 'result' ? 'on' : ''}`} onClick={() => setActiveNav('result')}>
            <span>Result</span>
          </button>
          <button className={`navitem ${activeNav === 'sftp-automation' ? 'on' : ''}`} onClick={() => setActiveNav('sftp-automation')}>
            <span>SFTP Automation</span>
          </button>

          <div className="grp eyebrow" style={{ paddingTop: '18px' }}>Pre-Production</div>
          <button className={`navitem ${activeNav === 'promote' ? 'on' : ''}`} onClick={() => setActiveNav('promote')}>
            <span>Go Live</span>
          </button>

          <div className="grp eyebrow" style={{ paddingTop: '18px' }}>Governance</div>
          <button className={`navitem ${activeNav === 'trust' ? 'on' : ''}`} onClick={() => setActiveNav('trust')}>
            <span>Trust Center</span>
          </button>
          <button className={`navitem ${activeNav === 'access' ? 'on' : ''}`} onClick={() => setActiveNav('access')}>
            <span>Access</span>
          </button>
          <button className={`navitem ${activeNav === 'defaults' ? 'on' : ''}`} onClick={() => setActiveNav('defaults')}>
            <span>Default Configs</span>
          </button>
          <button className={`navitem ${activeNav === 'audit' ? 'on' : ''}`} onClick={() => setActiveNav('audit')}>
            <span>Audit Log</span>
          </button>

          <div className="grp eyebrow" style={{ paddingTop: '18px' }}>Operations</div>
          <button className={`navitem ${activeNav === 'ops' ? 'on' : ''}`} onClick={() => setActiveNav('ops')}>
            <span>Operations</span>
          </button>
          <button className={`navitem ${activeNav === 'offboard' ? 'on' : ''}`} onClick={() => setActiveNav('offboard')}>
            <span>Offboarding</span>
          </button>
        </nav>

        <main className="main">
          {activeNav === 'clients' && (
            <ClientsTable
              clients={clients}
              onSelectClient={(clientId) => {
                handleSelectClient(clientId);
                setActiveNav('onboard');
              }}
              onOpenAddClient={() => setIsAddClientOpen(true)}
              onDeleteClient={handleOpenRevoke}
              canPermanentlyDelete={Boolean(currentUser?.is_superuser || currentUser?.role === 'Super Admin')}
            />
          )}

          {(activeNav === 'onboard' || activeNav === 'onboarding') && (
            <OnboardingLadder
              client={clientState?.client || clients.find(c => c.id === activeClientId)}
              steps={clientState?.steps || []}
              roles={roles}
              clients={clients}
              onSelectClient={handleSelectClient}
              onRefresh={() => { loadClients(); loadClientWorkflow(activeClientId); }}
              onOpenNotes={handleOpenNotes}
              onOpenRedo={handleOpenRedo}
              onOpenAddRole={() => setIsAddRoleOpen(true)}
            />
          )}

          {activeNav === 'docs' && (
            <DocumentsView
              clients={clients}
              activeClientId={activeClientId}
              onSelectClient={handleSelectClient}
            />
          )}

          {activeNav === 'files' && (
            <FilesView
              clients={clients}
              activeClientId={activeClientId}
              onSelectClient={handleSelectClient}
              onOpenFileModal={(fileId) => setAdminViewerFileId(fileId)}
              selectedClient={selectedOperationalClient}
            />
          )}

          {activeNav === 'conversions' && (
            <ConversionsView
              trackedFiles={adminTrackedFiles}
              onRefreshData={loadAdminTrackedFiles}
              onOpenFileModal={(fileId) => setAdminViewerFileId(fileId)}
              clients={clients}
              isAdmin={true}
              activeClientId={activeClientId}
              onSelectClient={handleSelectClient}
              selectedClient={selectedOperationalClient}
            />
          )}

          {activeNav === 'result' && (
            <ResultView
              clients={clients}
              isAdmin={true}
              initialClientId={activeClientId}
              selectedClient={selectedOperationalClient}
            />
          )}

          {activeNav === 'sftp-automation' && (
            <SftpAutomationView
              clients={clients}
              activeClientId={activeClientId}
              onSelectClient={handleSelectClient}
              selectedClient={selectedOperationalClient}
            />
          )}

          {activeNav === 'promote' && (
            selectedClientIsOffboarded ? <section className="view on"><div className="eyebrow">Go Live</div><h1>Workflow Locked</h1><div className="locked-view-client-bar"><label>Associate with Client:</label><ClientSelectDropdown clients={clients} value={activeClientId} onChange={handleSelectClientInGoLive} fullWidth /></div><OffboardedClientBanner client={selectedOperationalClient} detail="Go Live cannot be resumed, completed, or reset. Select another client above to continue." /></section> : <GoLiveView
              clients={clients}
              activeClientId={activeClientId}
              onSelectClient={handleSelectClientInGoLive}
              onClientUpdated={() => { loadClients(); loadClientWorkflow(activeClientId); }}
              onGoLiveCompleted={handleGoLiveCompleted}
              onOpenNotes={handleOpenNotes}
            />
          )}

          {activeNav === 'trust' && (
            <section className="view on" id="v-trust">
              <div className="hdr-row">
                <div>
                  <div className="eyebrow">Compliance Assurance</div>
                  <h1>Trust Center</h1>
                  <p className="sub">Security, encryption, HIPAA safeguards, and compliance attestations.</p>
                </div>
              </div>
              <div className="metrics">
                <div className="metric">
                  <div className="v" style={{ fontSize: '20px', fontWeight: 600 }}>SOC 2 Type II</div>
                  <div className="l">
                    <span className="tag ok">Attested</span>
                  </div>
                  <div className="d">Report available under NDA</div>
                </div>
                <div className="metric">
                  <div className="v" style={{ fontSize: '20px', fontWeight: 600 }}>ISO 27001</div>
                  <div className="l">
                    <span className="tag ok">Certified</span>
                  </div>
                  <div className="d">Surveillance audit Q1 2026</div>
                </div>
                <div className="metric">
                  <div className="v" style={{ fontSize: '20px', fontWeight: 600 }}>HIPAA Audit</div>
                  <div className="l">
                    <span className="tag ok">Audited</span>
                  </div>
                  <div className="d">Safeguards verified</div>
                </div>
                <div className="metric">
                  <div className="v" style={{ fontSize: '20px', fontWeight: 600 }}>Post-Quantum</div>
                  <div className="l">
                    <span className="tag ok">Encrypted</span>
                  </div>
                  <div className="d">ML-DSA-65 signatures</div>
                </div>
              </div>

              <h2 className="sec">Security Policies &amp; Standards</h2>
              <table style={{ width: '100%', tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th>Policy / Document</th>
                    <th>Standard</th>
                    <th>Status</th>
                    <th>Last Reviewed</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><b>Information Security Policy</b></td>
                    <td>ISO 27001:2022</td>
                    <td><span className="tag ok">Published</span></td>
                    <td className="num">15 Jan 2026</td>
                  </tr>
                  <tr>
                    <td><b>Incident Response Plan</b></td>
                    <td>NIST SP 800-61</td>
                    <td><span className="tag ok">Active</span></td>
                    <td className="num">10 Feb 2026</td>
                  </tr>
                  <tr>
                    <td><b>HIPAA Security Rule Safeguards</b></td>
                    <td>45 CFR Part 160/164</td>
                    <td><span className="tag ok">Compliant</span></td>
                    <td className="num">02 Feb 2026</td>
                  </tr>
                  <tr>
                    <td><b>Access Control Policy</b></td>
                    <td>SOC 2 CC6.0</td>
                    <td><span className="tag ok">Published</span></td>
                    <td className="num">18 Jan 2026</td>
                  </tr>
                </tbody>
              </table>
            </section>
          )}

          {activeNav === 'access' && (
            <AccessView currentUser={currentUser} />
          )}

          {activeNav === 'defaults' && (
            <DefaultConfigsView />
          )}

          {activeNav === 'audit' && (
            <AuditLogView clients={clients} />
          )}

          {activeNav === 'ops' && (
            <section className="view on" id="v-ops">
              <div className="eyebrow">Reliability</div>
              <h1>Operations &amp; Delivery</h1>
              <p className="sub">File delivery metrics, silent folder monitoring, and SLA tracking.</p>
              <div className="metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                <div className="metric">
                  <div className="v">1,248</div>
                  <div className="l">Total Files Processed</div>
                  <div className="d" style={{ color: 'var(--teal, #0d9488)', fontWeight: 600 }}>100% processed</div>
                </div>
                <div className="metric">
                  <div className="v">1,245</div>
                  <div className="l">Total Successful Push to Outbound</div>
                  <div className="d" style={{ color: 'var(--teal, #0d9488)', fontWeight: 600 }}>99.76% successful push</div>
                </div>
                <div className="metric">
                  <div className="v">1,248</div>
                  <div className="l">Pulled from Inbound</div>
                  <div className="d" style={{ color: 'var(--teal, #0d9488)', fontWeight: 600 }}>100% successfully pulled</div>
                </div>
                <div className="metric">
                  <div className="v" style={{ color: 'var(--teal, #0d9488)' }}>3,741</div>
                  <div className="l">Total Operations (All Cycles)</div>
                  <div className="d" style={{ color: 'var(--teal, #0d9488)', fontWeight: 600 }}>99.92% overall success</div>
                </div>
              </div>
            </section>
          )}

          {activeNav === 'offboard' && (
            <ClientOffboarding 
              clients={clients} 
              activeClientId={activeClientId} 
              onSelectClient={(clientId) => {
                setActiveClientId(clientId);
                loadClientWorkflow(clientId);
              }}
              offboardingState={offboardingState} 
              onRefresh={() => loadClientWorkflow(activeClientId)} 
              onOpenNotes={(stepKey, title) => { setActiveNoteTarget({ stepKey, stepTitle: title }); setIsNotesOpen(true); }}
            />
          )}
        </main>
      </div>

      {/* Viewport Centered Modals */}
      <AddClientModal
        isOpen={isAddClientOpen}
        onClose={() => setIsAddClientOpen(false)}
        onClientCreated={handleClientCreated}
        existingClients={clients}
      />

      <NotesModal
        isOpen={isNotesOpen}
        onClose={() => setIsNotesOpen(false)}
        clientId={activeClientId}
        stepKey={activeNoteTarget.stepKey}
        stepTitle={activeNoteTarget.stepTitle}
      />

      <AddRoleModal
        isOpen={isAddRoleOpen}
        onClose={() => setIsAddRoleOpen(false)}
        onRoleAdded={loadRoles}
      />

      <RedoConfirmModal
        isOpen={isRedoOpen}
        onClose={() => setIsRedoOpen(false)}
        stepNum={redoTarget.stepNum}
        onConfirm={handleConfirmRedo}
        loading={redoLoading}
      />

      <RevokeClientModal
        isOpen={isRevokeOpen}
        onClose={() => { if (!revokeLoading) setIsRevokeOpen(false); }}
        client={revokeTarget}
        onConfirm={handleConfirmRevoke}
        loading={revokeLoading}
      />

      <FileViewerModal
        fileId={adminViewerFileId}
        onClose={() => setAdminViewerFileId(null)}
      />

      <FeedbackModal
        isOpen={appFeedback.isOpen}
        onClose={() => setAppFeedback({ ...appFeedback, isOpen: false })}
        kind={appFeedback.kind}
        title={appFeedback.title}
        content={appFeedback.content}
        checks={[]}
      />

      {/* Tenant Key Destruction Confirmation Modal */}
      {isOffboardConfirmOpen && (
        <div className="modal on" onClick={() => setIsOffboardConfirmOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-t" style={{ color: 'var(--brick)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⚠️ Critical Warning</span> Permanent Tenant Key Destruction
            </div>
            
            <div className="modal-b" style={{ marginTop: '14px', fontSize: '13.5px', color: 'var(--ink)' }}>
              <p style={{ fontWeight: '600', color: 'var(--brick)' }}>
                WARNING: This action is destructive and CANNOT BE REVERTED under any circumstances.
              </p>
              <p style={{ marginTop: '10px' }}>
                All wrapped tenant keys will be destroyed immediately and all client records will be wiped.
              </p>
              <p style={{ marginTop: '12px', fontWeight: '500' }}>
                Please type <code style={{ color: 'var(--brick)', background: 'var(--brick-bg)', padding: '2px 4px', borderRadius: '3px' }}>CONFIRM</code> below to authorize the destruction procedure:
              </p>
              
              <input 
                type="text" 
                className="control mono" 
                placeholder="Type CONFIRM" 
                value={offboardConfirmInput}
                onChange={(e) => setOffboardConfirmInput(e.target.value)}
                style={{ width: '100%', marginTop: '12px', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: '4px', textAlign: 'center', letterSpacing: '2px', fontWeight: 'bold' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button type="button" className="btn" onClick={() => setIsOffboardConfirmOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={offboardConfirmInput !== 'CONFIRM'}
                onClick={() => {
                  setIsOffboardConfirmOpen(false);
                  setAppFeedback({
                    isOpen: true,
                    kind: 'ok',
                    title: 'Destruction Complete',
                    content: 'Cryptographic keys erased and tenant data wiped successfully. The procedure is complete.'
                  });
                }}
                style={{ 
                  background: offboardConfirmInput === 'CONFIRM' ? 'var(--brick)' : '#f1f5f9', 
                  borderColor: offboardConfirmInput === 'CONFIRM' ? 'var(--brick)' : '#e2e8f0', 
                  color: offboardConfirmInput === 'CONFIRM' ? '#ffffff' : '#94a3b8', 
                  fontWeight: '600',
                  cursor: offboardConfirmInput === 'CONFIRM' ? 'pointer' : 'not-allowed'
                }}
              >
                Permanently Destroy keys
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

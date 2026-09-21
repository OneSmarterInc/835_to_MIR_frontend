import React, { useEffect, useMemo } from 'react';
import ClientSelectDropdown from './ClientSelectDropdown';
import ChecksView from '../../pages/ChecksView';
import WorkspaceHeader from '../../components/WorkspaceHeader';

export default function AdminChecksView({ trackedFiles = [], clients = [], activeClientId = '', onSelectClient }) {
  const selectedClient = clients.find((client) => String(client.id) === String(activeClientId));

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.__MIR_ADMIN_CHECKS_CLIENT_ID = activeClientId ? String(activeClientId) : '';
    return () => {
      if (window.__MIR_ADMIN_CHECKS_CLIENT_ID === String(activeClientId || '')) {
        delete window.__MIR_ADMIN_CHECKS_CLIENT_ID;
      }
    };
  }, [activeClientId]);

  const clientFiles = useMemo(() => {
    if (!activeClientId) return [];
    const selectedId = String(activeClientId);
    const selectedName = String(selectedClient?.name || '').toLowerCase();
    return (trackedFiles || []).filter((file) => {
      const directIds = [file.client_id, file.clientId, file.client?.id, file.client?.client_id]
        .filter((value) => value !== undefined && value !== null)
        .map(String);
      if (directIds.includes(selectedId)) return true;

      const names = [file.client_name, file.client?.name, file.client]
        .filter((value) => typeof value === 'string')
        .map((value) => value.toLowerCase());
      return Boolean(selectedName) && names.includes(selectedName);
    });
  }, [trackedFiles, activeClientId, selectedClient]);

  return (
    <section className="view on table-screen">
      <WorkspaceHeader eyebrow="Validation workspace" title="Checks" description="Review inbound and outbound validation gates and their findings."><div className="workspace-header-client"><label>Client</label><ClientSelectDropdown clients={clients} value={activeClientId} onChange={onSelectClient} id="admin-checks-client" fullWidth /></div></WorkspaceHeader>

      {!activeClientId ? (
        <div className="card" style={{ padding: '30px 20px', color: 'var(--ink-3)' }}>Select a client to view their checks.</div>
      ) : (
        <ChecksView trackedFiles={clientFiles} showHeading={false} clientId={activeClientId} />
      )}
    </section>
  );
}

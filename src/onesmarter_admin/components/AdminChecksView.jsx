import React, { useMemo } from 'react';
import ClientSelectDropdown from './ClientSelectDropdown';
import ChecksView from '../../pages/ChecksView';

export default function AdminChecksView({ trackedFiles = [], clients = [], activeClientId = '', onSelectClient }) {
  const selectedClient = clients.find((client) => String(client.id) === String(activeClientId));

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
      <div className="admin-checks-heading">
        <h1>Checks</h1>
        <ClientSelectDropdown clients={clients} value={activeClientId} onChange={onSelectClient} id="admin-checks-client" />
      </div>

      {!activeClientId ? (
        <div className="card" style={{ padding: '30px 20px', color: 'var(--ink-3)' }}>Select a client to view their checks.</div>
      ) : (
        <ChecksView trackedFiles={clientFiles} showHeading={false} />
      )}
    </section>
  );
}

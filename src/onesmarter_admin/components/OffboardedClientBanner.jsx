import React from 'react';

export default function OffboardedClientBanner({ client, detail = 'Historical information remains available for read-only review.' }) {
  if (!client || String(client.stage || '').toLowerCase() !== 'offboarded') return null;
  return <div className="offboarded-client-banner" role="status">
    <strong>{client.name || 'This client'} is permanently offboarded</strong>
    <span>{detail}</span>
  </div>;
}

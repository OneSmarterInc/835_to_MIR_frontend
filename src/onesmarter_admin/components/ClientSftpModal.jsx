import React from "react";
import SftpConfigurationPanel from "../../components/SftpConfigurationPanel";

export default function ClientSftpModal({ clientId, onClose, onConfigured }) {
  return <div className="inline-viewer-modal" role="dialog" aria-modal="true" aria-label="Client SFTP configuration">
    <div className="inline-viewer-content" style={{ width: "94vw", maxWidth: 1280, height: "92vh" }}>
      <div className="inline-viewer-header"><div><div className="eyebrow">CLIENT TRANSFER ROUTES</div><h2 style={{ margin: "3px 0 0" }}>SFTP Configuration</h2></div><button type="button" className="modal-cross-btn" onClick={onClose} title="Close SFTP configuration">&times;</button></div>
      <div className="inline-viewer-body" style={{ padding: 20, overflow: "auto" }}><SftpConfigurationPanel compact clientId={clientId} onConfigured={onConfigured} /></div>
    </div>
  </div>;
}

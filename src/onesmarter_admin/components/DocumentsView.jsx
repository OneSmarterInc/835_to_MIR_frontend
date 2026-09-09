import React, { useState, useEffect } from 'react';
import ClientSelectDropdown from './ClientSelectDropdown';
import { fetchClientDocuments, downloadDocumentFile, fetchDocumentFile } from '../services/api';
import FileViewerModal from './modals/FileViewerModal';
import OffboardedClientBanner from './OffboardedClientBanner';
import './DocumentsView.css';

export default function DocumentsView({ clients = [], activeClientId, onSelectClient }) {
  const [selectedClientId, setSelectedClientId] = useState(activeClientId || (clients[0]?.id || ''));
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [viewingId, setViewingId] = useState(null);
  const [viewerFile, setViewerFile] = useState(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewerDocTitle, setViewerDocTitle] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const currentClient = clients.find(c => c.id === selectedClientId) || clients[0];

  useEffect(() => {
    if (activeClientId && activeClientId !== selectedClientId) {
      setSelectedClientId(activeClientId);
    }
  }, [activeClientId]);

  useEffect(() => {
    if (selectedClientId) {
      loadDocuments(selectedClientId);
    }
  }, [selectedClientId]);

  async function loadDocuments(clientId) {
    if (!clientId) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const docs = await fetchClientDocuments(clientId);
      setDocuments(docs);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to load documents');
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }

  function handleClientChange(e) {
    const newId = e.target.value;
    setSelectedClientId(newId);
    if (onSelectClient) {
      onSelectClient(newId);
    }
  }

  async function handleDownload(doc) {
    setDownloadingId(doc.id);
    setErrorMessage('');
    try {
      await downloadDocumentFile(doc.id, doc.original_filename);
    } catch (err) {
      setErrorMessage(`Failed to download ${doc.document_name}: ${err.message}`);
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleView(doc) {
    setViewingId(doc.id);
    setErrorMessage('');
    try {
      const data = await fetchDocumentFile(doc.id, doc.original_filename);
      setViewerFile(data);
      setViewerDocTitle(doc.document_name);
      setIsViewerOpen(true);
    } catch (err) {
      setErrorMessage(`Failed to preview ${doc.document_name}: ${err.message}`);
    } finally {
      setViewingId(null);
    }
  }

  function formatBytes(bytes) {
    if (bytes === null || bytes === undefined) return '—';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  const formatDate = value => value ? new Date(value).toLocaleDateString('en-US', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/New_York',
  }) : '—';

  const displayState = doc => {
    if (doc.expiration_date && doc.expiration_date < new Date().toISOString().slice(0, 10)) {
      return 'EXPIRED';
    }
    return doc.state || '—';
  };

  return (
    <section className="view on table-screen" id="v-docs">
      <div className="hdr-row">
        <div>
          <div className="documents-workspace-heading">
            <ClientSelectDropdown
              clients={clients}
              value={selectedClientId}
              onChange={(val) => {
                setSelectedClientId(val);
                if (onSelectClient) {
                  onSelectClient(val);
                }
              }}
            />
            <h1 style={{ margin: 0 }}>Documents &amp; Agreements</h1>
          </div>
        </div>
      </div>

      <OffboardedClientBanner
        client={currentClient}
        detail="This client is offboarded. The documents below are retained for historical, read-only review."
      />

      {errorMessage && (
        <div className="note" style={{ background: 'var(--brick-bg)', borderColor: 'var(--brick)', color: 'var(--brick)' }}>
          <b>Error:</b> {errorMessage}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-3)' }}>
          Loading documents for {currentClient?.name}...
        </div>
      ) : (
        <div className="admin-table-scroll documents-register-wrap">
        <table className="documents-register-table">
          <thead>
            <tr>
              <th>Document</th><th>Filename</th><th>Direction</th><th>Category</th><th>Format</th>
              <th>Size</th><th>Uploaded By</th><th>Signed or Sent</th><th>Expires</th>
              <th>Version</th><th>State</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => {
              const ext = doc.original_filename ? doc.original_filename.split('.').pop().toUpperCase() : '—';
              const state = displayState(doc);
              return (
                <tr key={doc.document_type}>
                  <td><b>{doc.document_name || '—'}</b></td>
                  <td>{doc.original_filename || '—'}</td>
                  <td>{doc.direction || '—'}</td><td>{doc.category || '—'}</td>
                  <td><span className="mono">{ext}</span></td>
                  <td className="num">{formatBytes(doc.file_size)}</td>
                  <td>{doc.uploaded_by || '—'}</td>
                  <td>{formatDate(doc.signed_or_sent_at)}</td>
                  <td>{doc.expiration_date ? formatDate(`${doc.expiration_date}T12:00:00`) : '—'}</td>
                  <td>{doc.version ? `v${doc.version}` : '—'}</td>
                  <td><span className={`document-state state-${state.toLowerCase().replaceAll(' ', '-')}`}>{state}</span></td>
                  <td><div className="document-actions">
                      {doc.id && <>
                      <button
                        type="button"
                        className="btn icon-btn view-btn"
                        onClick={() => handleView(doc)}
                        title={`View ${doc.document_name}`}
                        aria-label={`View ${doc.document_name}`}
                        disabled={viewingId === doc.id}
                      >
                        {viewingId === doc.id ? (
                          '…'
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block' }}>
                            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                          </svg>
                        )}
                      </button>
                      <button
                        type="button"
                        className="btn icon-btn download-btn"
                        disabled={downloadingId === doc.id}
                        onClick={() => handleDownload(doc)}
                        title={`Download ${doc.document_name}`}
                        aria-label={`Download ${doc.document_name}`}
                      >
                        {downloadingId === doc.id ? (
                          '…'
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block' }}>
                            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                          </svg>
                        )}
                      </button>
                      </>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}

      <FileViewerModal
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        fileData={viewerFile}
        stepTitle={viewerDocTitle}
        stepNum=""
      />
    </section>
  );
}

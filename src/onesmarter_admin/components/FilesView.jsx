import React, { useEffect, useState } from 'react';
import ClientSelectDropdown from './ClientSelectDropdown';
import { fetchClientEdiFiles, pushEdiFileToSftp } from '../services/api';
import TimeDisplay from '../../components/TimeDisplay';
import { showAppAlert } from '../../components/AppDialog';
import FileActionButtons from '../../components/FileActionButtons';
import OffboardedClientBanner from './OffboardedClientBanner';
import ArchiveZipMenu from '../../components/ArchiveZipMenu';
import WorkspaceHeader from '../../components/WorkspaceHeader';

function canonicalMirFilename(file) {
  return file?.mir_filename || file?.output_filename || file?.combined_filename || '';
}

export default function FilesView({ clients = [], activeClientId, onSelectClient, onOpenFileModal, selectedClient }) {
  const [selectedClientId, setSelectedClientId] = useState(activeClientId || (clients[0]?.id || ''));
  const [ediFiles, setEdiFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [pushingId, setPushingId] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');

  const currentClient = selectedClientId ? clients.find((c) => c.id === selectedClientId) || null : null;
  const isOffboarded = String((currentClient || selectedClient)?.stage || '').toLowerCase() === 'offboarded';

  useEffect(() => {
    if (activeClientId && activeClientId !== selectedClientId) setSelectedClientId(activeClientId);
  }, [activeClientId, selectedClientId]);

  useEffect(() => {
    loadEdiFiles(selectedClientId);
  }, [selectedClientId]);

  async function loadEdiFiles(clientId) {
    setLoading(true);
    setErrorMessage('');
    try {
      setEdiFiles(await fetchClientEdiFiles(clientId));
    } catch (err) {
      setErrorMessage(err.message || 'Failed to load files');
      setEdiFiles([]);
    } finally {
      setLoading(false);
    }
  }

  const handleSortHeader = (key) => {
    if (sortKey === key) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  let filtered = ediFiles.filter((item) => {
    if (!searchText) return true;
    const query = searchText.toLowerCase();
    const fullStr = (
      (item.id || '') + ' ' +
      (item.original_filename || '') + ' ' +
      (canonicalMirFilename(item) || '') + ' ' +
      (item.output_path || '')
    ).toLowerCase();
    return fullStr.includes(query);
  });

  filtered.sort((a, b) => {
    const mult = sortOrder === 'asc' ? 1 : -1;
    if (sortKey === 'date') return (new Date(a.uploaded_at || 0) - new Date(b.uploaded_at || 0)) * mult;
    if (sortKey === 'id') return (a.id || '').localeCompare(b.id || '') * mult;
    if (sortKey === 'filename') return (a.original_filename || '').localeCompare(b.original_filename || '') * mult;
    if (sortKey === 'claims') return ((a.claims_count || 0) - (b.claims_count || 0)) * mult;
    if (sortKey === 'sftp') return ((a.present_in_sftp ? 1 : 0) - (b.present_in_sftp ? 1 : 0)) * mult;
    if (sortKey === 'status') return (a.status || '').localeCompare(b.status || '') * mult;
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageIndex = Math.min(currentPage, totalPages);
  const startIndex = (pageIndex - 1) * pageSize;
  const pageItems = filtered.slice(startIndex, startIndex + pageSize);

  const conversionSets = ediFiles.length;
  const archivedCount = ediFiles.filter((f) => f.status === 'ARCHIVED').length;
  const files835 = ediFiles.length;
  const validatedSets = ediFiles.filter((f) => f.status !== 'ERROR').length;
  const processedSets = ediFiles.filter((f) => f.status === 'ARCHIVED').length;
  const waitingFailed = ediFiles.filter((f) => f.status === 'PROCESSING').length;
  const valFailed = ediFiles.filter((f) => f.status === 'ERROR').length;

  const handleDownloadZip = async (type) => {
    try {
      const url = selectedClientId
        ? `/api/download-zip/?type=${type}&client=${encodeURIComponent(selectedClientId)}`
        : `/api/download-zip/?type=${type}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to generate ZIP archive');
      const blob = await res.blob();
      const urlObj = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = urlObj;
      a.download = `EDI_Archive_${type}_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(urlObj);
        a.remove();
      }, 1000);
    } catch (err) {
      await showAppAlert('ZIP Download error: ' + err.message, { title: 'Download Failed', tone: 'error' });
    }
  };

  const handleDownloadMir = async (file) => {
    const mirName = canonicalMirFilename(file);
    if (!mirName) {
      await showAppAlert('The configured MIR filename is not available for this conversion yet.', { title: 'MIR Not Available', tone: 'info' });
      return;
    }
    try {
      const res = await fetch(
        `/admin-panel/api/clients/${encodeURIComponent(selectedClientId)}/edi-files/${encodeURIComponent(file.id)}/mir/?download=1`,
        { credentials: 'include' },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to download file');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = mirName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 1500);
    } catch (err) {
      await showAppAlert(`Unable to download MIR: ${err.message}`, { title: 'Download Failed', tone: 'error' });
    }
  };

  const handlePushMir = async (file) => {
    if (isOffboarded) return;
    setPushingId(file.id);
    try {
      const result = await pushEdiFileToSftp(file.id);
      await showAppAlert(result.message, { title: 'MIR Sent', tone: 'success' });
      await loadEdiFiles(selectedClientId);
    } catch (err) {
      await showAppAlert(`Unable to push MIR to SFTP: ${err.message}`, { title: 'SFTP Transfer Failed', tone: 'error' });
    } finally {
      setPushingId(null);
    }
  };

  const sortArrow = (key) => (sortKey === key ? (sortOrder === 'asc' ? '↑' : '↓') : '⇅');

  return (
    <section className="view on table-screen" id="v-files">
      <WorkspaceHeader
        eyebrow="File history workspace"
        title="Archive"
        description="Review and export all retained 835, MIR, and reconciliation conversion sets."
      >
        <div className="workspace-header-client">
          <label>Client</label>
          <ClientSelectDropdown
            clients={clients}
            value={selectedClientId}
            includeGlobal
            onChange={(val) => {
              setSelectedClientId(val);
              setCurrentPage(1);
              if (val && onSelectClient) onSelectClient(val);
            }}
            fullWidth
          />
        </div>
        <ArchiveZipMenu onDownload={handleDownloadZip} />
      </WorkspaceHeader>

      <OffboardedClientBanner
        client={currentClient || selectedClient}
        detail="Files and archive history remain read-only. New processing and SFTP delivery are locked."
      />

      {errorMessage && (
        <div className="note" style={{ background: 'var(--brick-bg)', borderColor: 'var(--brick)', color: 'var(--brick)', marginBottom: '16px' }}>
          <b>Error:</b> {errorMessage}
        </div>
      )}

      <div className="metrics" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <div className="metric"><div className="v">{conversionSets}</div><div className="l">Conversion sets</div><div className="d"><span>{archivedCount}</span> physical file seals stored</div></div>
        <div className="metric"><div className="v">{files835}</div><div className="l">835 files received</div><div className="d">Across all conversion sets</div></div>
        <div className="metric"><div className="v">0</div><div className="l">837 references</div><div className="d">Optional - reference only</div></div>
        <div className="metric"><div className="v">{validatedSets}</div><div className="l">Validated sets</div><div className="d">835 validation passed</div></div>
        <div className="metric"><div className="v">{processedSets}</div><div className="l">Processed sets</div><div className="d"><span>{waitingFailed}</span> waiting/failed - <span>{valFailed}</span> validation failed</div></div>
      </div>

      <div className="filters-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <input
          type="text"
          placeholder="Search run, 835, 837, or MIR..."
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value);
            setCurrentPage(1);
          }}
          style={{ padding: '7px 12px', fontSize: '12px', border: '1px solid var(--line)', borderRadius: '4px', width: '280px' }}
        />
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-3)' }}>{filtered.length} sets</span>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-3)' }}>
          Loading archive files for {currentClient?.name || 'Global System Default'}...
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '16px' }}>
          <div style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden' }}>
            <table className="datatable" style={{ width: '100%', maxWidth: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '15%' }} />
                <col style={{ width: '6%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '6%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '7%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th className={`sortable ${sortKey === 'date' ? sortOrder : ''}`} onClick={() => handleSortHeader('date')} style={{ fontSize: '11px', letterSpacing: '0.05em' }}>835 DATE / TIME (EST) <span className="sort-arrow">{sortArrow('date')}</span></th>
                  <th className={`sortable ${sortKey === 'id' ? sortOrder : ''}`} onClick={() => handleSortHeader('id')} style={{ fontSize: '11px', letterSpacing: '0.05em' }}>RUN <span className="sort-arrow">{sortArrow('id')}</span></th>
                  <th className={`sortable ${sortKey === 'filename' ? sortOrder : ''}`} onClick={() => handleSortHeader('filename')} style={{ fontSize: '11px', letterSpacing: '0.05em' }}>835 INPUT <span className="sort-arrow">{sortArrow('filename')}</span></th>
                  <th style={{ fontSize: '11px', letterSpacing: '0.05em' }}>837 REF</th>
                  <th style={{ fontSize: '11px', letterSpacing: '0.05em' }}>MIR OUTPUT</th>
                  <th className={`sortable ${sortKey === 'claims' ? sortOrder : ''}`} onClick={() => handleSortHeader('claims')} style={{ fontSize: '11px', letterSpacing: '0.05em' }}>CLAIMS <span className="sort-arrow">{sortArrow('claims')}</span></th>
                  <th className={`sortable ${sortKey === 'sftp' ? sortOrder : ''}`} onClick={() => handleSortHeader('sftp')} style={{ fontSize: '11px', letterSpacing: '0.05em' }}>IMPORT MODE <span className="sort-arrow">{sortArrow('sftp')}</span></th>
                  <th style={{ fontSize: '11px', letterSpacing: '0.05em' }}>SFTP PUSH</th>
                  <th className={`sortable ${sortKey === 'status' ? sortOrder : ''}`} onClick={() => handleSortHeader('status')} style={{ fontSize: '11px', letterSpacing: '0.05em' }}>STATUS <span className="sort-arrow">{sortArrow('status')}</span></th>
                  <th style={{ fontSize: '11px', letterSpacing: '0.05em' }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.length === 0 ? (
                  <tr>
                    <td colSpan="10" style={{ padding: '32px', textAlign: 'center', color: 'var(--ink-3)' }}>
                      {ediFiles.length === 0 ? 'No EDI 835 files found in the archive for this client.' : 'No conversion sets match these filters.'}
                    </td>
                  </tr>
                ) : pageItems.map((f) => {
                  const shortId = 'R-' + (f.id || '').substring(0, 6).toUpperCase();
                  const mirName = canonicalMirFilename(f);
                  const isProcessed = f.status === 'ARCHIVED';
                  const isSftpSuccess = Boolean(f.present_in_sftp);
                  const canPushToSftp = isProcessed && !isSftpSuccess && !isOffboarded;
                  const sftpStatusText = isSftpSuccess ? 'Pushed' : f.status === 'ERROR' ? 'Failed' : 'Push to SFTP';
                  const sftpTagClass = isSftpSuccess ? 'ok' : f.status === 'ERROR' ? 'bad' : 'work';
                  const displayStatus = f.status === 'ARCHIVED'
                    ? (isSftpSuccess ? 'Validated & SFTP Success' : 'Validated & SFTP Pending')
                    : f.status === 'PROCESSING'
                      ? 'Validated & SFTP Pending'
                      : f.status === 'ERROR'
                        ? 'Validation Failed'
                        : `${f.status} & SFTP ${sftpStatusText}`;
                  const statusTagClass = f.status === 'ARCHIVED' ? 'ok' : f.status === 'ERROR' ? 'bad' : 'work';
                  const isSftpSource = f.ingestion_source === 'SFTP' || (f.original_filename && f.original_filename.includes(',')) || (f.input_path && f.input_path.toLowerCase().includes('sftp'));
                  const sourceLabel = isSftpSource ? 'SFTP' : 'MANUAL';
                  const sourceTagClass = isSftpSource ? 'ok' : 'work';
                  const sourceTitle = isSftpSource ? 'Ingested automatically from SFTP inbound folder' : 'Uploaded manually via conversion form';

                  return (
                    <tr key={f.id}>
                      <td className="num" style={{ whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word' }}><TimeDisplay value={f.uploaded_at} includeSeconds easternOnly /></td>
                      <td className="num" style={{ fontWeight: 600, fontSize: '11.5px' }}>{shortId}</td>
                      <td className="num" style={{ color: 'var(--ink-2)', whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{f.original_filename}</td>
                      <td className="num" style={{ color: 'var(--ink-3)' }}>—</td>
                      <td className="num" style={{ color: 'var(--ink-2)', whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{isProcessed ? (mirName || '—') : '—'}</td>
                      <td className="num">{f.claims_count || 0}</td>
                      <td><span className={`tag ${sourceTagClass}`} style={{ fontSize: '10.5px' }} title={sourceTitle}>{sourceLabel}</span></td>
                      <td>
                        {canPushToSftp ? (
                          <button type="button" className="tag work" style={{ cursor: 'pointer' }} title="Upload the generated MIR file to the configured SFTP server" onClick={() => handlePushMir(f)} disabled={pushingId === f.id}>
                            {pushingId === f.id ? 'Pushing...' : 'Push to SFTP'}
                          </button>
                        ) : (
                          <span className={`tag ${sftpTagClass}`} title={isSftpSuccess ? 'MIR uploaded to the configured SFTP server.' : undefined}>{isOffboarded && !isSftpSuccess ? 'Locked' : sftpStatusText}</span>
                        )}
                      </td>
                      <td><span className={`tag ${statusTagClass}`}>{displayStatus}</span></td>
                      <td className="num" style={{ fontSize: '11px', whiteSpace: 'nowrap', overflow: 'visible' }}>
                        <FileActionButtons
                          onView={() => onOpenFileModal?.(f.id)}
                          onDownload={isProcessed && mirName ? () => handleDownloadMir(f) : null}
                          viewTitle="View / Edit Code"
                          downloadTitle="Download .mir File"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--line)', background: 'var(--surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--ink-3)' }}>Rows per page:</span>
              <select value={pageSize} onChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setCurrentPage(1); }} style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid var(--line)', borderRadius: '4px' }}>
                <option value="10">10</option><option value="20">20</option><option value="50">50</option><option value="100">100</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button className="btn secondary" style={{ padding: '4px 10px', fontSize: '11px' }} disabled={pageIndex <= 1} onClick={() => setCurrentPage(pageIndex - 1)}>– Previous</button>
              <span style={{ fontSize: '11px', color: 'var(--ink-2)' }}>Page {pageIndex} of {totalPages}</span>
              <button className="btn secondary" style={{ padding: '4px 10px', fontSize: '11px' }} disabled={pageIndex >= totalPages} onClick={() => setCurrentPage(pageIndex + 1)}>Next →</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ fontSize: '11.5px', color: 'var(--teal)', fontWeight: 500, display: 'flex', gap: '24px' }}>
        <span>■ Archive table = one row per conversion set</span>
        <span>■ Physical 835 / 837 / MIR file hashes remain stored individually</span>
      </div>
    </section>
  );
}

import React, { useState, useEffect } from 'react';
import ClientSelectDropdown from './ClientSelectDropdown';
import { fetchClientEdiFiles, downloadEdiFile, pushEdiFileToSftp } from '../services/api';
import TimeDisplay from '../../components/TimeDisplay';
import { showAppAlert } from '../../components/AppDialog';
import EyeIcon from '../../components/EyeIcon';
import OffboardedClientBanner from './OffboardedClientBanner';
import ArchiveZipMenu from '../../components/ArchiveZipMenu';

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

  const currentClient = selectedClientId ? clients.find(c => c.id === selectedClientId) || null : null;
  const isOffboarded = String((currentClient || selectedClient)?.stage || '').toLowerCase() === 'offboarded';

  useEffect(() => {
    if (activeClientId && activeClientId !== selectedClientId) setSelectedClientId(activeClientId);
  }, [activeClientId]);
  useEffect(() => { loadEdiFiles(selectedClientId); }, [selectedClientId]);

  async function loadEdiFiles(clientId) {
    setLoading(true); setErrorMessage('');
    try { setEdiFiles(await fetchClientEdiFiles(clientId)); }
    catch (err) { setErrorMessage(err.message || 'Failed to load files'); setEdiFiles([]); }
    finally { setLoading(false); }
  }

  const handleSortHeader = (key) => {
    if (sortKey === key) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortOrder('asc'); }
  };

  let filtered = ediFiles.filter((item) => {
    if (!searchText) return true;
    const query = searchText.toLowerCase();
    const fullStr = ((item.id || '') + ' ' + (item.original_filename || '') + ' ' + (canonicalMirFilename(item) || '') + ' ' + (item.output_path || '')).toLowerCase();
    return fullStr.includes(query);
  });

  filtered.sort((a, b) => {
    const mult = sortOrder === 'asc' ? 1 : -1;
    let valA = 0, valB = 0;
    if (sortKey === 'date') { valA = new Date(a.uploaded_at || 0).getTime(); valB = new Date(b.uploaded_at || 0).getTime(); }
    else if (sortKey === 'id') { valA = (a.id || '').toLowerCase(); valB = (b.id || '').toLowerCase(); }
    else if (sortKey === 'filename') { valA = (a.original_filename || '').toLowerCase(); valB = (b.original_filename || '').toLowerCase(); }
    else if (sortKey === 'claims') { valA = a.claims_count || 0; valB = b.claims_count || 0; }
    else if (sortKey === 'status') { valA = (a.status || '').toLowerCase(); valB = (b.status || '').toLowerCase(); }
    else if (sortKey === 'sftp') { valA = a.present_in_sftp ? 1 : 0; valB = b.present_in_sftp ? 1 : 0; }
    if (valA < valB) return -1 * mult;
    if (valA > valB) return 1 * mult;
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageIndex = Math.min(currentPage, totalPages);
  const startIndex = (pageIndex - 1) * pageSize;
  const pageItems = filtered.slice(startIndex, startIndex + pageSize);
  const conversionSets = ediFiles.length;
  const archivedCount = ediFiles.filter(f => f.status === 'ARCHIVED').length;
  const files835 = ediFiles.length;
  const validatedSets = ediFiles.filter(f => f.status !== 'ERROR').length;
  const processedSets = ediFiles.filter(f => f.status === 'ARCHIVED').length;
  const waitingFailed = ediFiles.filter(f => f.status === 'PROCESSING').length;
  const valFailed = ediFiles.filter(f => f.status === 'ERROR').length;

  const handleDownloadZip = async (type) => {
    try {
      const url = selectedClientId ? `/api/download-zip/?type=${type}&client=${encodeURIComponent(selectedClientId)}` : `/api/download-zip/?type=${type}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to generate ZIP archive');
      const blob = await res.blob(); const urlObj = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = urlObj; a.download = `EDI_Archive_${type}_${Date.now()}.zip`; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(urlObj); a.remove(); }, 1000);
    } catch (err) { await showAppAlert('ZIP Download error: ' + err.message, { title: 'Download Failed', tone: 'error' }); }
  };

  const handleDownloadMir = async (file) => {
    const mirName = canonicalMirFilename(file);
    if (!mirName) { await showAppAlert('The configured MIR filename is not available for this conversion yet.', { title: 'MIR Not Available', tone: 'info' }); return; }
    try {
      // Use the same canonical name displayed in MIR OUTPUT as the browser
      // download name. This is intentionally explicit for the Admin Files page.
      const res = await fetch(`${'/admin-panel/api'}/clients/${encodeURIComponent(selectedClientId)}/edi-files/${encodeURIComponent(file.id)}/mir/?download=1`, { headers: { Authorization: `Token ${localStorage.getItem('onesmarter_admin_token')}` } });
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
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
    } catch (err) { console.error('Download MIR error:', err); await showAppAlert(`Unable to download MIR: ${err.message}`, { title: 'Download Failed', tone: 'error' }); }
  };

  const handlePushMir = async (file) => {
    if (isOffboarded) return;
    setPushingId(file.id);
    try { const result = await pushEdiFileToSftp(file.id); await showAppAlert(result.message, { title: 'MIR Sent', tone: 'success' }); await loadEdiFiles(selectedClientId); }
    catch (err) { await showAppAlert(`Unable to push MIR to SFTP: ${err.message}`, { title: 'SFTP Transfer Failed', tone: 'error' }); }
    finally { setPushingId(null); }
  };

  return (
    <section className="view on" id="v-files">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <div><div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}><h1 style={{ margin: 0 }}>Archive</h1><span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--ink-3)', textTransform: 'uppercase' }}>ALL CONVERSION-SET HISTORY</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}><span style={{ fontSize: '11px', color: 'var(--ink-3)' }}>Client:</span><ClientSelectDropdown clients={clients} value={selectedClientId} includeGlobal={true} onChange={(val) => { setSelectedClientId(val); setCurrentPage(1); if (val && onSelectClient) onSelectClient(val); }} /></div>
        </div>
        <ArchiveZipMenu onDownload={handleDownloadZip} />
      </div>
      <p className="sub" style={{ marginTop: '4px', marginBottom: '20px' }}>One row represents one 835 conversion set for <b>{currentClient?.name || 'Global System Default'}</b>. The 835 input(s), optional 837 reference, MIR output, validation result, and processing result stay together.</p>
      <OffboardedClientBanner client={currentClient || selectedClient} detail="Files and archive history remain read-only. New processing and SFTP delivery are locked." />
      {errorMessage && <div className="note" style={{ background: 'var(--brick-bg)', borderColor: 'var(--brick)', color: 'var(--brick)', marginBottom: '16px' }}><b>Error:</b> {errorMessage}</div>}
      <div className="metrics files-metrics-grid" style={{ gap: '12px', marginBottom: '20px' }}><div className="metric"><div className="v">{conversionSets}</div><div className="l">Conversion sets</div><div className="d"><span>{archivedCount}</span> physical file seals stored</div></div><div className="metric"><div className="v">{files835}</div><div className="l">835 files received</div><div className="d">Across all conversion sets</div></div><div className="metric"><div className="v">0</div><div className="l">837 references</div><div className="d">Optional - reference only</div></div><div className="metric"><div className="v">{validatedSets}</div><div className="l">Validated sets</div><div className="d">835 validation passed</div></div><div className="metric"><div className="v">{processedSets}</div><div className="l">Processed sets</div><div className="d"><span>{waitingFailed}</span> waiting/failed – <span>{valFailed}</span> validation failed</div></div></div>
      <div className="filters-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}><input type="text" placeholder="Search run, 835, 837, or MIR..." value={searchText} onChange={(e) => { setSearchText(e.target.value); setCurrentPage(1); }} style={{ padding: '7px 12px', fontSize: '12px', border: '1px solid var(--line)', borderRadius: '4px', width: '280px' }} /><span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-3)' }}>{filtered.length} sets</span></div>
      {loading ? <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-3)' }}>Loading archive files for {currentClient?.name || 'Global System Default'}...</div> : <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '16px' }}><div style={{ overflowX: 'auto' }}><table className="datatable" style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th>835 DATE / TIME (EST)</th><th>RUN</th><th>835 INPUT</th><th>837 REF</th><th>MIR OUTPUT</th><th>CLAIMS</th><th>IMPORT MODE</th><th>SFTP PUSH</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{pageItems.length === 0 ? <tr><td colSpan="10" style={{ padding: '32px', textAlign: 'center', color: 'var(--ink-3)' }}>{ediFiles.length === 0 ? 'No EDI 835 files found in the archive for this client.' : 'No conversion sets match these filters.'}</td></tr> : pageItems.map((f) => { const shortId = 'R-' + (f.id || '').substring(0, 6).toUpperCase(); const mirName = canonicalMirFilename(f); const isProcessed = f.status === 'ARCHIVED'; const isSftpSuccess = Boolean(f.present_in_sftp); const canPushToSftp = isProcessed && !isSftpSuccess; const sftpStatusText = isSftpSuccess ? 'Pushed' : f.status === 'ERROR' ? 'Failed' : 'Push to SFTP'; const sftpTagClass = isSftpSuccess ? 'ok' : f.status === 'ERROR' ? 'bad' : 'work'; const displayStatus = f.status === 'ARCHIVED' ? (isSftpSuccess ? 'Validated & SFTP Success' : 'Validated & SFTP Pending') : f.status === 'PROCESSING' ? 'Validated & SFTP Pending' : f.status === 'ERROR' ? 'Validation Failed' : f.status + ' & SFTP ' + sftpStatusText; const statusTagClass = f.status === 'ARCHIVED' ? 'ok' : f.status === 'ERROR' ? 'bad' : 'work'; const isSftpSource = f.ingestion_source === 'SFTP' || (f.original_filename && f.original_filename.includes(',')) || (f.input_path && f.input_path.toLowerCase().includes('sftp')); return <tr key={f.id}><td className="num" style={{ minWidth: '210px', whiteSpace: 'normal' }}><TimeDisplay value={f.uploaded_at} includeSeconds easternOnly /></td><td className="num" style={{ fontWeight: 600, fontSize: '11.5px' }}>{shortId}</td><td className="num" style={{ color: 'var(--ink-2)' }}>{f.original_filename}</td><td className="num" style={{ color: 'var(--ink-3)' }}>—</td><td className="num" style={{ color: 'var(--ink-2)' }}>{isProcessed ? (mirName || '—') : '—'}</td><td className="num">{f.claims_count || 0}</td><td><span className={`tag ${isSftpSource ? 'ok' : 'work'}`} style={{ fontSize: '10.5px' }}>{isSftpSource ? 'SFTP' : 'MANUAL'}</span></td><td>{canPushToSftp ? <button type="button" className="tag work" style={{ fontSize: '10.5px', cursor: 'pointer' }} onClick={() => handlePushMir(f)} disabled={pushingId === f.id}>{pushingId === f.id ? 'Pushing…' : 'Push to SFTP'}</button> : <span className={`tag ${sftpTagClass}`} style={{ fontSize: '10.5px' }}>{sftpStatusText}</span>}</td><td><span className={`tag ${statusTagClass}`} style={{ fontSize: '10.5px' }}>{displayStatus}</span></td><td className="num"><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', minHeight: '32px' }}><button type="button" className="btn-eye files-single-eye" title="View File" onClick={() => onOpenFileModal?.(f.id)}><EyeIcon /></button>{isProcessed && mirName ? <button type="button" className="btn-download" title={`Download ${mirName}`} onClick={() => handleDownloadMir(f)}><svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" /></svg></button> : null}</div></td></tr>; })}</tbody></table></div><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--line)', background: 'var(--surface)' }}><div><span style={{ fontSize: '11px', color: 'var(--ink-3)' }}>Rows per page:</span> <select value={pageSize} onChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setCurrentPage(1); }}><option value="10">10</option><option value="20">20</option><option value="50">50</option><option value="100">100</option></select></div><div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><button className="btn secondary" disabled={pageIndex <= 1} onClick={() => setCurrentPage(pageIndex - 1)}>– Previous</button><span style={{ fontSize: '11px', color: 'var(--ink-2)' }}>Page {pageIndex} of {totalPages}</span><button className="btn secondary" disabled={pageIndex >= totalPages} onClick={() => setCurrentPage(pageIndex + 1)}>Next →</button></div></div></div>}
    </section>
  );
}
